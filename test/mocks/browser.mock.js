// test/mocks/browser.mock.js
const Module = require('module');

// In-memory storages
const storageMock = () => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; }
  };
};

const localStorage = storageMock();
const sessionStorage = storageMock();

// Mock Document and DOM elements
const documentMock = {
  createElement: (tag) => {
    const el = {
      tag,
      style: {},
      classList: new Set(),
      children: [],
      appendChild: (child) => {
        el.children.push(child);
        return child;
      },
      click: () => {
        el.clicked = true;
        if (el.onclick) el.onclick();
      },
      setAttribute: (k, v) => { el[k] = v; },
      getAttribute: (k) => el[k],
      removeAttribute: (k) => { delete el[k]; },
      toDataURL: () => 'data:image/png;base64,dummy'
    };
    return el;
  },
  head: {
    appendChild: () => {},
    removeChild: () => {}
  },
  body: {
    appendChild: () => {},
    removeChild: () => {}
  },
  querySelector: () => null,
  getElementById: () => null
};

// Clipboard Mock
const clipboardMock = {
  text: '',
  writeText: async function(txt) {
    this.text = txt;
    return Promise.resolve();
  },
  readText: async function() {
    return Promise.resolve(this.text);
  }
};

// MediaRecorder Mock
class MockMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.onstart = null;
    this.onstop = null;
    this.ondataavailable = null;
    this.onpause = null;
    this.onresume = null;
  }
  start() {
    this.state = 'recording';
    if (this.onstart) this.onstart();
  }
  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['dummy audio chunk'], { type: 'audio/webm' }) });
    }
    if (this.onstop) this.onstop();
  }
  pause() {
    this.state = 'paused';
    if (this.onpause) this.onpause();
  }
  resume() {
    this.state = 'recording';
    if (this.onresume) this.onresume();
  }
}

// SpeechRecognition Mock
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'id-ID';
    this.onstart = null;
    this.onresult = null;
    this.onend = null;
    this.onerror = null;
    this.isStarted = false;
  }
  start() {
    this.isStarted = true;
    if (this.onstart) this.onstart();
    // Simulate recognition result asynchronously
    setTimeout(() => {
      if (this.isStarted && this.onresult) {
        this.onresult({
          results: [
            [
              { transcript: 'Halo selamat datang di Notara' }
            ]
          ]
        });
      }
      if (this.isStarted && this.onend) {
        this.onend();
      }
    }, 50);
  }
  stop() {
    this.isStarted = false;
    if (this.onend) this.onend();
  }
}

// Set global browser variables
global.window = {
  location: {
    origin: 'http://localhost:3000',
    href: 'http://localhost:3000/'
  },
  print: () => {
    global.window.printed = true;
  },
  localStorage,
  sessionStorage,
  document: documentMock,
  navigator: {
    clipboard: clipboardMock,
    userAgent: 'NodeTestAgent'
  },
  AudioContext: class {
    createMediaStreamSource() { return {}; }
    createAnalyser() { return { connect: () => {}, fftSize: 2048 }; }
  }
};

global.document = documentMock;
global.navigator = global.window.navigator;
global.localStorage = localStorage;
global.sessionStorage = sessionStorage;
global.MediaRecorder = MockMediaRecorder;
global.SpeechRecognition = MockSpeechRecognition;
global.webkitSpeechRecognition = MockSpeechRecognition;
global.Blob = class Blob {
  constructor(content, options) {
    this.content = content;
    this.options = options;
    this.size = (content && content[0] && content[0].length) || 0;
    this.type = options?.type || '';
  }
};

// Mock canvas dynamic drawings
global.HTMLCanvasElement = class HTMLCanvasElement {};

// Intercept html2canvas module import
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'html2canvas') {
    const mockFunc = async () => {
      return {
        toDataURL: () => 'data:image/png;base64,dummy_html2canvas_data'
      };
    };
    mockFunc.default = mockFunc;
    return mockFunc;
  }
  return originalLoad.apply(this, arguments);
};

module.exports = {
  localStorage,
  sessionStorage,
  clipboardMock,
  MockMediaRecorder,
  MockSpeechRecognition
};
