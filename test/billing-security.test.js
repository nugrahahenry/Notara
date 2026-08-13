const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  verifyMidtransSignature,
} = require('../build/lib/midtrans.js');
const {
  mapMidtransNotificationStatus,
  processBillingNotification,
} = require('../build/lib/billing/webhook.js');

function sign(payload, key) {
  return crypto
    .createHash('sha512')
    .update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${key}`)
    .digest('hex');
}

function notification(overrides = {}) {
  return {
    order_id: 'NOTARA-PRO-user1234-1000',
    transaction_status: 'settlement',
    status_code: '200',
    gross_amount: '49000.00',
    signature_key: 'signed-notification',
    payment_type: 'bank_transfer',
    fraud_status: 'accept',
    ...overrides,
  };
}

test('Midtrans signature accepts exact signed fields and rejects a changed amount', async () => {
  const previousKey = process.env.MIDTRANS_SERVER_KEY;
  process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-test-secret';

  try {
    const payload = {
      order_id: 'NOTARA-PRO-user1234-1000',
      status_code: '200',
      gross_amount: '49000.00',
    };
    const signature_key = sign(payload, process.env.MIDTRANS_SERVER_KEY);

    assert.equal(await verifyMidtransSignature({ ...payload, signature_key }), true);
    assert.equal(
      await verifyMidtransSignature({
        ...payload,
        gross_amount: '99000.00',
        signature_key,
      }),
      false,
    );
  } finally {
    if (previousKey === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = previousKey;
  }
});

test('Midtrans signature fails closed for missing and dummy keys outside development', async () => {
  const previousKey = process.env.MIDTRANS_SERVER_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  const payload = {
    order_id: 'NOTARA-PRO-user1234-1000',
    status_code: '200',
    gross_amount: '49000.00',
    signature_key: 'dummy',
  };

  try {
    delete process.env.MIDTRANS_SERVER_KEY;
    assert.equal(await verifyMidtransSignature(payload), false);

    process.env.MIDTRANS_SERVER_KEY = 'dummy-server-key';
    assert.equal(await verifyMidtransSignature(payload), false);
  } finally {
    if (previousKey === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = previousKey;

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('Midtrans status mapping only promotes verified final success states', () => {
  assert.equal(mapMidtransNotificationStatus(notification()), 'success');
  assert.equal(
    mapMidtransNotificationStatus(notification({ transaction_status: 'capture' })),
    'success',
  );
  assert.equal(
    mapMidtransNotificationStatus(notification({ transaction_status: 'capture', fraud_status: 'challenge' })),
    null,
  );
  assert.equal(mapMidtransNotificationStatus(notification({ transaction_status: 'pending', status_code: '201' })), 'pending');
  assert.equal(mapMidtransNotificationStatus(notification({ transaction_status: 'deny', status_code: '202' })), 'failed');
  assert.equal(mapMidtransNotificationStatus(notification({ transaction_status: 'cancel', status_code: '202' })), 'failed');
  assert.equal(mapMidtransNotificationStatus(notification({ transaction_status: 'expire', status_code: '202' })), 'expired');
  assert.equal(mapMidtransNotificationStatus(notification({ transaction_status: 'refund' })), null);
});

test('billing processor rejects malformed and invalidly signed notifications before RPC', async () => {
  let rpcCreated = false;
  const dependencies = {
    verifySignature: async () => false,
    createRpcClient: () => {
      rpcCreated = true;
      throw new Error('must not run');
    },
  };

  assert.deepEqual(await processBillingNotification({}, dependencies), {
    status: 400,
    body: { error: 'Payload webhook tidak valid.' },
  });
  assert.deepEqual(await processBillingNotification(notification(), dependencies), {
    status: 401,
    body: { error: 'Signature webhook tidak valid.' },
  });
  assert.equal(rpcCreated, false);
});

test('billing processor ignores unsupported states without mutating billing data', async () => {
  let rpcCreated = false;
  const result = await processBillingNotification(
    notification({ transaction_status: 'refund' }),
    {
      verifySignature: async () => true,
      createRpcClient: () => {
        rpcCreated = true;
        throw new Error('must not run');
      },
    },
  );

  assert.deepEqual(result, { status: 200, body: { success: true, ignored: true } });
  assert.equal(rpcCreated, false);
});

test('billing processor sends one normalized payment transition to the privileged RPC', async () => {
  const calls = [];
  const result = await processBillingNotification(notification(), {
    verifySignature: async () => true,
    createRpcClient: () => ({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { error: null };
      },
    }),
  });

  assert.deepEqual(calls, [{
    name: 'handle_payment_callback',
    args: {
      p_order_id: 'NOTARA-PRO-user1234-1000',
      p_status: 'success',
      p_payment_type: 'bank_transfer',
    },
  }]);
  assert.deepEqual(result, { status: 200, body: { success: true, status: 'success' } });
});

test('billing processor keeps privileged configuration and RPC failures generic', async () => {
  const unavailable = await processBillingNotification(notification(), {
    verifySignature: async () => true,
    createRpcClient: () => {
      throw new Error('service-role-secret-must-not-leak');
    },
  });
  assert.deepEqual(unavailable, {
    status: 503,
    body: { error: 'Konfigurasi billing belum tersedia.' },
  });

  const rpcFailure = await processBillingNotification(notification(), {
    verifySignature: async () => true,
    createRpcClient: () => ({
      rpc: async () => ({ error: { message: 'database-details-must-not-leak' } }),
    }),
  });
  assert.deepEqual(rpcFailure, {
    status: 500,
    body: { error: 'Gagal memproses notifikasi billing.' },
  });
});