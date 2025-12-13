import crypto from 'crypto';
import { query } from '../../../lib/db.js';
import baseLogger from '../../../utils/logger.js';

const logger = baseLogger.withContext('LinTS');

function zeros(n) {
  return Array.from({ length: n }, () => 0);
}

function identity(n, scale = 1) {
  const m = [];
  for (let i = 0; i < n; i++) {
    const row = zeros(n);
    row[i] = scale;
    m.push(row);
  }
  return m;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function matVec(M, v) {
  const out = zeros(M.length);
  for (let i = 0; i < M.length; i++) {
    out[i] = dot(M[i], v);
  }
  return out;
}

function outer(u, v) {
  const n = u.length;
  const m = v.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = zeros(m);
    for (let j = 0; j < m; j++) row[j] = u[i] * v[j];
    out.push(row);
  }
  return out;
}

function matSub(A, B) {
  const out = [];
  for (let i = 0; i < A.length; i++) {
    const row = zeros(A[i].length);
    for (let j = 0; j < A[i].length; j++) row[j] = A[i][j] - B[i][j];
    out.push(row);
  }
  return out;
}

function matScale(A, k) {
  const out = [];
  for (let i = 0; i < A.length; i++) {
    const row = zeros(A[i].length);
    for (let j = 0; j < A[i].length; j++) row[j] = A[i][j] * k;
    out.push(row);
  }
  return out;
}

function cholesky(A) {
  // Lower-triangular L such that A = L L^T
  const n = A.length;
  const L = Array.from({ length: n }, () => zeros(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const v = A[i][i] - sum;
        L[i][j] = v > 0 ? Math.sqrt(v) : 0;
      } else {
        const denom = L[j][j] || 1e-12;
        L[i][j] = (A[i][j] - sum) / denom;
      }
    }
  }
  return L;
}

function mulLowerVec(L, z) {
  const n = L.length;
  const out = zeros(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
    out[i] = s;
  }
  return out;
}

function randn() {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function sampleMVN(mu, cov) {
  const n = mu.length;
  const z = zeros(n).map(() => randn());
  const L = cholesky(cov);
  const w = mulLowerVec(L, z);
  const out = zeros(n);
  for (let i = 0; i < n; i++) out[i] = mu[i] + w[i];
  return out;
}

export function buildActionFeatureVector(x, actionId, actionCount) {
  const d = x.length;
  const D = d * actionCount;
  const out = zeros(D);
  const offset = actionId * d;
  for (let i = 0; i < d; i++) out[offset + i] = x[i];
  return out;
}

export function generateFeatureOrderHash(fields) {
  return crypto.createHash('sha256').update(fields.join(',')).digest('hex').slice(0, 16);
}

export class LinTSModel {
  constructor({ domain, featureDim, actionCount, lambda = 1.0, v = 0.5, featureOrderHash }) {
    this.domain = domain;
    this.featureDim = featureDim;
    this.actionCount = actionCount;
    this.lambda = lambda;
    this.v = v;
    this.featureOrderHash = featureOrderHash;

    this.D = featureDim * actionCount;
    this.mu = zeros(this.D);
    this.b = zeros(this.D); // f vector in tech-bandit-v3.md
    this.Binv = identity(this.D, 1 / lambda);
  }

  static async loadOrInit({ domain, version = 1, featureDim, actionCount, lambda, v, featureOrderHash }) {
    const r = await query(
      `select weights, covariance, meta
         from bandit_models
        where domain = $1 and version = $2
        limit 1`,
      [domain, version]
    );
    const row = r.rows?.[0];
    if (!row) {
      const model = new LinTSModel({ domain, featureDim, actionCount, lambda, v, featureOrderHash });
      await model.save({ version });
      return model;
    }

    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    if (meta.featureOrderHash && meta.featureOrderHash !== featureOrderHash) {
      throw new Error(`featureOrderHash mismatch for ${domain}: db=${meta.featureOrderHash} code=${featureOrderHash}`);
    }

    const model = new LinTSModel({ domain, featureDim, actionCount, lambda, v, featureOrderHash });
    model.mu = Array.isArray(row.weights) ? row.weights.map(Number) : zeros(model.D);
    model.Binv = Array.isArray(row.covariance) ? row.covariance : identity(model.D, 1 / lambda);
    model.b = Array.isArray(meta.b) ? meta.b.map(Number) : zeros(model.D);
    return model;
  }

  selectAction(x) {
    const covScaled = matScale(this.Binv, this.v ** 2);
    const theta = sampleMVN(this.mu, covScaled);
    let best = 0;
    let bestScore = -Infinity;
    for (let a = 0; a < this.actionCount; a++) {
      const offset = a * this.featureDim;
      const thetaA = theta.slice(offset, offset + this.featureDim);
      const score = dot(thetaA, x);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  update(x, actionId, reward) {
    const xa = buildActionFeatureVector(x, actionId, this.actionCount);
    const Binv_x = matVec(this.Binv, xa);
    const denom = 1 + dot(xa, Binv_x);
    const num = outer(Binv_x, Binv_x);
    this.Binv = matSub(this.Binv, matScale(num, 1 / denom));

    // b = b + r*x ; mu = Binv*b
    for (let i = 0; i < this.b.length; i++) this.b[i] += reward * xa[i];
    this.mu = matVec(this.Binv, this.b);
  }

  async save({ version = 1 }) {
    const meta = {
      featureDim: this.featureDim,
      actionCount: this.actionCount,
      lambda: this.lambda,
      v: this.v,
      featureOrderHash: this.featureOrderHash,
      b: this.b
    };
    await query(
      `insert into bandit_models (domain, version, weights, covariance, meta, created_at, updated_at)
       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, timezone('utc', now()), timezone('utc', now()))
       on conflict (domain, version)
       do update set
         weights = excluded.weights,
         covariance = excluded.covariance,
         meta = excluded.meta,
         updated_at = timezone('utc', now())`,
      [
        this.domain,
        version,
        JSON.stringify(this.mu),
        JSON.stringify(this.Binv),
        JSON.stringify(meta)
      ]
    );
  }
}

