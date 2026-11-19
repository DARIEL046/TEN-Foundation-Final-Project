import crypto from 'crypto';
import QRCode from 'qrcode';
import * as workerModel from '../models/workerModels.js';
import ValidationError from '../utils/ValidationError.js';

const cleanName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');
const toNameKey = (name) => name.toLowerCase();

const NAME_PATTERN = /^\p{L}[\p{L}\p{M}\s.'-]*$/u;

const validateName = (name) => {
    if (!name) {
        throw new ValidationError(400, "Worker name is required!");
    }
    if (name.length < 2 || name.length > 50) {
        throw new ValidationError(400, "Worker name must be 2 to 100 characters long!");
    }
    if (!NAME_PATTERN.test(name)) {
        throw new ValidationError(400, "Worker name can only contain letters, spaces and periods!");
    }
};

// Random hex characters - ID
const generateWorkerId = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const id = `WRK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const existing = await workerModel.findWorkerByWorkerId(id);
        if (existing.length === 0) {
            return id;
        }
    }
    throw new Error("Unable to generate a unique worker ID. Please try again.");
};

// The QR is always built from the worker's saved ID and name
export const withQrCode = async (worker) => {
    const qrPayload = JSON.stringify({ workerId: worker.workerId, name: worker.name });
    const qrCode = await QRCode.toDataURL(qrPayload, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
    });
    return { ...worker, qrPayload, qrCode };
};

export const fetchAllWorkers = async () => {
    const workers = await workerModel.fetchAllWorkers();
    return Promise.all(workers.map(withQrCode));
};

export const registerWorker = async (input) => {
    const name = cleanName(input.name);
    validateName(name);

    const nameKey = toNameKey(name);
    const existing = await workerModel.findWorkerByNameKey(nameKey);
    if (existing.length > 0) {
        throw new ValidationError(409, `${existing[0].name} is already registered as ${existing[0].workerId}!`);
    }

    const workerId = await generateWorkerId();

    try {
        await workerModel.insert(workerId, name, nameKey);
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            throw new ValidationError(409, "That worker is already registered!");
        }
        throw e;
    }

    const [saved] = await workerModel.findWorkerByWorkerId(workerId);
    return withQrCode(saved);
};

const WORKER_ID_PATTERN = /^WRK-[0-9A-F]{6}$/;

export const deleteWorker = async (workerId) => {
    if (!WORKER_ID_PATTERN.test(workerId)) {
        throw new ValidationError(400, "Invalid worker ID!");
    }

    const existing = await workerModel.findWorkerByWorkerId(workerId);
    if (existing.length === 0) {
        throw new ValidationError(404, "Worker does not exist!");
    }

    await workerModel.remove(workerId);
    return "Worker deleted successfully!";
};
