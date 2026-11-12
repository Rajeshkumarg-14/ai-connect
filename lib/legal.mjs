import { AppError } from './store.mjs';
export const LEGAL_VERSION = '2026-11-12';
export function legalStatus(data, enforced = true) {
  const record = data.legalAcceptance;
  const accepted = record?.termsVersion === LEGAL_VERSION && record?.privacyVersion === LEGAL_VERSION && record?.providerAcknowledged === true && Boolean(record.acceptedAt);
  return { required: enforced && !accepted, accepted, termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, urls: { terms: '/legal/terms.html', privacy: '/legal/privacy.html', license: '/legal/license.html', security: '/legal/security.html' }, acceptance: accepted ? record : null };
}
export function acceptLegal(store, input) {
  if (input.accepted !== true || input.providerAcknowledged !== true) throw new AppError('Explicit Terms acceptance, Privacy acknowledgment, and provider activity acknowledgment are required.');
  if (input.termsVersion !== LEGAL_VERSION || input.privacyVersion !== LEGAL_VERSION) throw new AppError('The legal notice changed. Refresh and review the current version before accepting.', 409);
  store.data.legalAcceptance = { termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, acceptedAt: new Date().toISOString(), providerAcknowledged: true };
  store.save(); return legalStatus(store.data);
}
