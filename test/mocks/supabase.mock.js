// test/mocks/supabase.mock.js
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy-key-for-testing';

const Module = require('module');

// Define database state
let dbState = {
  folders: [],
  summaries: [],
  chat_messages: [],
  study_groups: [],
  group_members: [],
  group_folders: [],
  users: [],
  profiles: [],
  factors: [],
  challenges: []
};

// Reset database state
function resetDb() {
  dbState.folders = [];
  dbState.summaries = [];
  dbState.chat_messages = [];
  dbState.study_groups = [];
  dbState.group_members = [];
  dbState.group_folders = [];
  dbState.users = [];
  dbState.profiles = [];
  dbState.factors = [];
  dbState.challenges = [];
  mockAuth.currentUser = null;
}

class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orderBy = null;
    this.isSingle = false;
    this.updateData = null;
    this.insertData = null;
    this.isDelete = false;
    this.inFilters = [];
  }

  select(columns) {
    this.selectColumns = columns;
    return this;
  }

  order(column, { ascending } = { ascending: true }) {
    this.orderBy = { column, ascending };
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  in(column, values) {
    this.inFilters.push({ column, values });
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  insert(data) {
    this.insertData = data;
    return this;
  }

  update(data) {
    this.updateData = data;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  // Support promise resolving (.then)
  async then(resolve, reject) {
    try {
      const result = await this.execute();
      if (resolve) {
        return Promise.resolve(resolve(result));
      }
      return Promise.resolve(result);
    } catch (err) {
      if (reject) {
        return Promise.reject(reject(err));
      }
      return Promise.reject(err);
    }
  }

  async execute() {
    let list = dbState[this.table] || [];

    // Apply eq filters
    for (const filter of this.filters) {
      list = list.filter(item => item[filter.column] === filter.value);
    }

    // Apply in filters
    for (const filter of this.inFilters) {
      list = list.filter(item => filter.values.includes(item[filter.column]));
    }

    // Handle delete
    if (this.isDelete) {
      const remaining = (dbState[this.table] || []).filter(item => !list.includes(item));
      dbState[this.table] = remaining;
      return { data: null, error: null };
    }

    // Handle insert
    if (this.insertData) {
      const items = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const created = items.map(item => {
        const newItem = {
          id: item.id || 'id-' + Math.random().toString(36).substring(2, 10),
          created_at: new Date().toISOString(),
          ...item
        };
        if (!dbState[this.table]) {
          dbState[this.table] = [];
        }
        dbState[this.table].push(newItem);
        return newItem;
      });
      const data = Array.isArray(this.insertData) ? created : created[0];
      return { data, error: null };
    }

    // Handle update
    if (this.updateData) {
      list.forEach(item => {
        Object.assign(item, this.updateData);
      });
      const data = this.isSingle ? list[0] : list;
      return { data: data || null, error: null };
    }

    // Handle order
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      list = [...list].sort((a, b) => {
        const valA = a[column];
        const valB = b[column];
        if (valA < valB) return ascending ? -1 : 1;
        if (valA > valB) return ascending ? 1 : -1;
        return 0;
      });
    }

    // Handle nested columns join / select columns filter
    if (this.selectColumns && typeof this.selectColumns === 'string') {
      const columnsStr = this.selectColumns;
      // Copy list to avoid mutating dbState directly
      list = list.map(item => ({ ...item }));

      // Regex to find joins: e.g. profiles:user_id (email, full_name)
      const joinRegex = /(\w+)(?::(\w+))?\s*\(([^)]+)\)/g;
      let match;
      while ((match = joinRegex.exec(columnsStr)) !== null) {
        const alias = match[1];
        const fkField = match[2] || match[1];
        const relation = match[1];
        const nestedFields = match[3].split(',').map(s => s.trim());

        list.forEach(item => {
          const fkValue = item[fkField];
          // Find matching profile in profiles table
          const relTable = dbState[relation] || [];
          let relRow = relTable.find(r => r.id === fkValue);
          
          if (!relRow && relation === 'profiles') {
            // Fallback to dbState.users if profile doesn't exist
            const user = (dbState.users || []).find(u => u.id === fkValue);
            if (user) {
              relRow = {
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.user_metadata?.name || ''
              };
            }
          }

          if (relRow) {
            if (nestedFields.includes('*')) {
              item[alias] = { ...relRow };
            } else {
              item[alias] = {};
              nestedFields.forEach(field => {
                item[alias][field] = relRow[field];
              });
            }
          } else {
            item[alias] = null;
          }
        });
      }
    }

    if (this.isSingle) {
      if (list.length === 0) {
        return { data: null, error: new Error('Row not found') };
      }
      return { data: list[0], error: null };
    }

    return { data: list, error: null };
  }
}

const mockAuth = {
  currentUser: null,
  currentLevel: 'aal1',

  async getUser() {
    return { data: { user: this.currentUser }, error: null };
  },

  async signUp({ email, password, options }) {
    const user = {
      id: 'usr-' + Math.random().toString(36).substring(2, 10),
      email,
      password,
      user_metadata: options?.data || {},
      created_at: new Date().toISOString()
    };
    dbState.users.push(user);
    if (!dbState.profiles) {
      dbState.profiles = [];
    }
    dbState.profiles.push({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      updated_at: new Date().toISOString()
    });
    this.currentUser = user;
    this.currentLevel = 'aal1';
    return { data: { user, session: { access_token: 'mock-token' } }, error: null };
  },

  async signInWithPassword({ email, password }) {
    const user = dbState.users.find(u => u.email === email);
    if (!user) {
      return { data: { user: null, session: null }, error: new Error('Invalid login credentials') };
    }
    const correctPassword = user.password || 'securepass';
    if (correctPassword !== password) {
      return { data: { user: null, session: null }, error: new Error('Invalid login credentials') };
    }
    this.currentUser = user;
    this.currentLevel = 'aal1';
    return { data: { user, session: { access_token: 'mock-token' } }, error: null };
  },

  async signInWithOAuth() {
    const user = {
      id: 'google-user-id',
      email: 'google@notara.com',
      user_metadata: { full_name: 'Google User' },
      created_at: new Date().toISOString()
    };
    if (!dbState.profiles) {
      dbState.profiles = [];
    }
    if (!dbState.profiles.some(p => p.id === user.id)) {
      dbState.profiles.push({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        updated_at: new Date().toISOString()
      });
    }
    this.currentUser = user;
    this.currentLevel = 'aal1';
    return { data: { user, session: { access_token: 'oauth-token' } }, error: null };
  },

  async signOut() {
    this.currentUser = null;
    this.currentLevel = 'aal1';
    return { error: null };
  },

  mfa: {
    getAuthenticatorAssuranceLevel: async () => {
      const activeFactors = dbState.factors.filter(f => f.status === 'verified');
      const hasAal2 = activeFactors.length > 0;
      return {
        data: {
          currentLevel: mockAuth.currentLevel || 'aal1',
          nextLevel: hasAal2 ? 'aal2' : 'aal1'
        },
        error: null
      };
    },

    listFactors: async () => {
      return {
        data: {
          all: dbState.factors,
          totp: dbState.factors.filter(f => f.factorType === 'totp')
        },
        error: null
      };
    },

    enroll: async ({ factorType, issuer, friendlyName }) => {
      const id = 'factor-' + Math.random().toString(36).substring(2, 10);
      const secret = 'JBSWY3DPEHPK3PXP';
      const qr_code = `otpauth://totp/${issuer}?secret=${secret}`;
      const factor = {
        id,
        factorType,
        friendlyName,
        status: 'unverified',
        created_at: new Date().toISOString()
      };
      dbState.factors.push(factor);
      return {
        data: {
          id,
          totp: { qr_code, secret }
        },
        error: null
      };
    },

    challenge: async ({ factorId }) => {
      const id = 'challenge-' + Math.random().toString(36).substring(2, 10);
      const challenge = { id, factorId };
      dbState.challenges.push(challenge);
      return {
        data: challenge,
        error: null
      };
    },

    verify: async ({ factorId, code }) => {
      if (code === '123456') {
        const factor = dbState.factors.find(f => f.id === factorId);
        if (factor) {
          factor.status = 'verified';
          mockAuth.currentLevel = 'aal2';
          return { data: { access_token: 'mfa-verified-token' }, error: null };
        }
      }
      return { data: null, error: new Error('Kode salah atau kedaluwarsa. Silakan coba lagi.') };
    },

    unenroll: async ({ factorId }) => {
      dbState.factors = dbState.factors.filter(f => f.id !== factorId);
      return { data: { id: factorId }, error: null };
    }
  }
};

const mockSupabaseClient = {
  auth: mockAuth,
  from(table) {
    return new MockQueryBuilder(table);
  }
};

// Setup require hook to intercept modules
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/ssr' || request === '@supabase/supabase-js') {
    return {
      createBrowserClient: () => mockSupabaseClient,
      createClient: () => mockSupabaseClient,
      supabase: mockSupabaseClient
    };
  }
  return originalLoad.apply(this, arguments);
};

module.exports = {
  dbState,
  mockSupabaseClient,
  resetDb,
  MockQueryBuilder
};
