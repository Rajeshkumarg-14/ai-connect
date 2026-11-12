const providerName = provider => provider === 'claude' ? 'Claude Code' : provider === 'codex' ? 'Codex' : 'The agent';

export function sanitizeDiagnostic(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) if (typeof secret === 'string' && secret.length > 6) text = text.split(secret).join('[redacted]');
  return text
    .replace(/(?:Bearer\s+)[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-|sess-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/[a-f0-9]{64}/gi, '[redacted]')
    .replace(/((?:token|api[_-]?key|authorization|secret)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[redacted]')
    .slice(0, 2000);
}

export function diagnose(error, { provider, kind, secrets = [] } = {}) {
  const raw = String(error?.message ?? error ?? '');
  const name = providerName(provider);
  const build = (code, title, message, recovery, retryable, details) => ({ code, title, message, recovery, retryable, ...(details ? { details: sanitizeDiagnostic(details, secrets) } : {}) });
  if (kind === 'process-blocked' || ['EPERM', 'EACCES'].includes(error?.code) || /spawn\s+(?:EPERM|EACCES)|operation not permitted|access is denied/i.test(raw)) return build('SERVER_PROCESS_BLOCKED', 'The server cannot launch the agent', `${name} did not start because the Connect server was denied permission to create a local process.`, 'Restart Connect from a normal PowerShell terminal with npm start, then retry this message. Keep the agent sandbox and permission settings enabled.', true);
  if (kind === 'missing-cli' || error?.code === 'ENOENT' || /CLI was not found|executable not found/i.test(raw)) return build('CLI_NOT_FOUND', `${name} is not available`, `Connect could not find the installed ${name} executable.`, `Check that ${provider || 'the agent'} runs in your terminal and is on PATH, then restart Connect and retry.`, true);
  if (kind === 'quota' || (!/time limit|turn limit|turn budget|output.{0,30}limit/i.test(raw) && /(?:hit|reached|exceeded).{0,40}(?:limit|quota)|rate.?limit|usage.?limit|insufficient.{0,20}(?:credits|quota)|out of.{0,10}credits|429/i.test(raw))) {
    const reset = raw.match(/\bresets?\s+[^\r\n]{1,160}/i)?.[0];
    return build('PROVIDER_QUOTA', `${name} usage limit reached`, `${name} could not complete this turn because its provider usage allowance is exhausted.`, 'Wait for the provider limit to reset or check your provider plan, then retry. Connect will not retry automatically.', true, reset);
  }
  if (kind === 'auth' || /not (?:logged|signed) in|authentication|unauthori[sz]ed|invalid.{0,15}(?:api.?key|token)|login required|please (?:log|sign) in|401/i.test(raw)) return build('AUTH_REQUIRED', `${name} needs sign-in`, `${name} could not authenticate with its provider.`, `Open ${provider || 'the agent'} in a terminal, sign in using its normal login flow, then retry this message.`, true);
  if (kind === 'timeout' || /(?:exceeded|reached).{0,30}(?:time limit|timeout)|timed? out/i.test(raw)) return build('TURN_TIMEOUT', 'The agent turn timed out', `${name} exceeded the time allowed for this turn and was stopped.`, 'Review any partial response. Retry with a smaller, more focused request if work remains.', true);
  if (kind === 'budget' || /turn limit reached|turn budget/i.test(raw)) return build('TURN_BUDGET_EXHAUSTED', 'The room turn budget is exhausted', 'No new agent turn was started because the room reached its configured limit.', 'Reset the room turn budget, then use Run this message. Existing work will not be replayed automatically.', true);
  if (kind === 'writer-conflict' || /already editing|terminal may be editing/i.test(raw)) return build('WRITER_CONFLICT', 'Another session may be editing this project', 'Connect did not start a second writer in the same project directory.', 'Stop the other writer or choose a read-only reviewer in a separate room.', true);
  if (kind === 'queue-full' || /queue is full/i.test(raw)) return build('QUEUE_FULL', 'The agent queue is full', 'The message was saved, but no additional turn could be queued.', 'Wait for existing work to finish, then run this message again.', true);
  if (kind === 'bridge' || /relay target|native messaging|exact target|ListAgents|SendMessage/i.test(raw)) return build('NATIVE_BRIDGE_FAILED', 'The live Claude bridge is unavailable', 'The relay could not verify or message the exact selected Claude session.', 'Confirm that the selected Claude session is still running and supports native messaging. Retry the relay, or use the managed reviewer without a live bridge.', true);
  if (kind === 'interrupted' || /server restarted|previous turn was interrupted/i.test(raw)) return build('RUN_INTERRUPTED', 'The previous turn was interrupted', 'Connect restarted before the agent finished its last turn.', 'Review the saved history and retry only the work that is still needed.', true);
  if (kind === 'output-limit' || /output exceeded/i.test(raw)) return build('OUTPUT_LIMIT', 'The agent produced too much output', 'Connect stopped this turn after reaching its output limit.', 'Use a narrower request and ask for a concise response, then retry.', true);
  return build('AGENT_RUN_FAILED', `${name} could not complete the turn`, 'The local CLI reported a failure. Connect saved the conversation and did not replay the request.', `Check ${name} in a terminal for provider or configuration problems, then retry the saved message.`, true);
}
