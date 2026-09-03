/**
 * MATHPIX — student uploads must not be retained by the OCR vendor.
 *
 * Mathpix keeps submitted images and documents by default to improve its
 * models. A photo of a student's homework is an education record, so:
 *
 *   1. Every /v3/text and /v3/pdf request carries metadata.improve_mathpix=false
 *      (Mathpix processes the upload and discards it).
 *   2. Every PDF is deleted from Mathpix (DELETE /v3/pdf/{id}) once the text
 *      is retrieved — and also when the job fails or times out, so nothing is
 *      left behind on an error path.
 *   3. The path-based helpers that two callers destructure from these modules
 *      actually exist. They did not, so teacher-resource uploads silently
 *      indexed with no text.
 *
 * public/subprocessors.html states (1) and (2); subprocessorsListed.test.js
 * binds that copy to this behaviour.
 */

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

const ocr = require('../../utils/ocr');
const processPDF = require('../../utils/pdfOcr');

const TEXT_URL = 'https://api.mathpix.com/v3/text';
const PDF_URL = 'https://api.mathpix.com/v3/pdf';

// FormData bodies are streams; recover the options_json part as an object.
function optionsJsonFrom(formData) {
  const raw = formData.getBuffer().toString('utf8');
  const m = raw.match(/name="options_json"\r\n\r\n([\s\S]*?)\r\n--/);
  return JSON.parse(m[1]);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.MATHPIX_APP_ID = 'app';
  process.env.MATHPIX_APP_KEY = 'key';
  axios.delete.mockResolvedValue({ status: 200 });
});

afterEach(() => jest.restoreAllMocks());

describe('image OCR (/v3/text)', () => {
  test('opts out of Mathpix retention on every request', async () => {
    axios.post.mockResolvedValue({ data: { text: 'x + 1 = 2', confidence: 0.9 } });

    await ocr('data:image/png;base64,AAAA');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe(TEXT_URL);
    expect(body.metadata).toEqual({ improve_mathpix: false });
  });

  test('performOCR reads a file from disk and returns { text }', async () => {
    axios.post.mockResolvedValue({ data: { latex_styled: '\\frac{1}{2}' } });
    const file = path.join(os.tmpdir(), `mm-ocr-${process.pid}.png`);
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    try {
      const result = await ocr.performOCR(file);
      expect(result).toEqual({ text: '\\frac{1}{2}' });
      const body = axios.post.mock.calls[0][1];
      expect(body.src).toMatch(/^data:image\/png;base64,/);
      expect(body.metadata.improve_mathpix).toBe(false);
    } finally {
      fs.unlinkSync(file);
    }
  });
});

describe('PDF OCR (/v3/pdf)', () => {
  const upload = () => axios.post.mockResolvedValue({ data: { pdf_id: 'pdf-123' } });

  test('opts out of retention on upload and deletes the document once the text is retrieved', async () => {
    upload();
    axios.get
      .mockResolvedValueOnce({ data: { status: 'completed', conversion_status: { md: { status: 'completed' } } } })
      .mockResolvedValueOnce({ data: '# Homework\n\n$x=2$' });

    const text = await processPDF(Buffer.from('%PDF-1.4'), 'hw.pdf');

    expect(text).toBe('# Homework\n\n$x=2$');
    const [url, formData] = axios.post.mock.calls[0];
    expect(url).toBe(PDF_URL);
    expect(optionsJsonFrom(formData).metadata).toEqual({ improve_mathpix: false });

    expect(axios.delete).toHaveBeenCalledTimes(1);
    expect(axios.delete.mock.calls[0][0]).toBe(`${PDF_URL}/pdf-123`);
    expect(axios.delete.mock.calls[0][1].headers).toMatchObject({ app_id: 'app', app_key: 'key' });
    // Deleted after the markdown fetch, not before.
    expect(axios.delete.mock.invocationCallOrder[0]).toBeGreaterThan(axios.get.mock.invocationCallOrder[1]);
  });

  test('still deletes the document when Mathpix reports an error', async () => {
    upload();
    axios.get.mockResolvedValueOnce({ data: { status: 'error', error: 'corrupt' } });

    await expect(processPDF(Buffer.from('%PDF-1.4'), 'hw.pdf')).rejects.toThrow(/corrupt/);
    expect(axios.delete).toHaveBeenCalledWith(`${PDF_URL}/pdf-123`, expect.anything());
  });

  test('a failed delete is logged, not surfaced — the student already has their text', async () => {
    upload();
    axios.get
      .mockResolvedValueOnce({ data: { status: 'completed', conversion_status: { md: { status: 'completed' } } } })
      .mockResolvedValueOnce({ data: 'ok' });
    axios.delete.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));

    await expect(processPDF(Buffer.from('%PDF-1.4'), 'hw.pdf')).resolves.toBe('ok');
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/Could not delete pdf-123/), 500);
  });

  test('does not attempt a delete when the upload itself failed (nothing to delete)', async () => {
    axios.post.mockRejectedValue(new Error('network'));

    await expect(processPDF(Buffer.from('%PDF-1.4'), 'hw.pdf')).rejects.toThrow(/network/);
    expect(axios.delete).not.toHaveBeenCalled();
  });

  test('extractTextFromPDF reads a file from disk', async () => {
    upload();
    axios.get
      .mockResolvedValueOnce({ data: { status: 'completed', conversion_status: { md: { status: 'completed' } } } })
      .mockResolvedValueOnce({ data: 'from disk' });
    const file = path.join(os.tmpdir(), `mm-pdf-${process.pid}.pdf`);
    fs.writeFileSync(file, '%PDF-1.4');

    try {
      await expect(processPDF.extractTextFromPDF(file)).resolves.toBe('from disk');
    } finally {
      fs.unlinkSync(file);
    }
  });
});

describe('the callers that destructure the path-based helpers get real functions', () => {
  // routes/teacherResources.js and utils/resourceDetector.js do
  //   const { performOCR } = require('../utils/ocr');
  //   const { extractTextFromPDF } = require('../utils/pdfOcr');
  // Before these exports existed both were undefined and the calls threw
  // inside a try/catch, so uploads silently indexed with no text.
  test('performOCR and extractTextFromPDF are exported', () => {
    expect(typeof require('../../utils/ocr').performOCR).toBe('function');
    expect(typeof require('../../utils/pdfOcr').extractTextFromPDF).toBe('function');
  });
});
