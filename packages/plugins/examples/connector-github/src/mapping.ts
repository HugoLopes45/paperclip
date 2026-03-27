import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_NS } from "./constants.js";

type IssueMapping = { paperclipIssueId: string };
type PrMapping = { paperclipIssueId: string };
type OutboundEchoRecord = { ts: number };

function issueKey(owner: string, repo: string, ghNumber: number): string {
  return `${STATE_NS}:issue:${owner}/${repo}:${ghNumber}`;
}

function prKey(owner: string, repo: string, prNumber: number): string {
  return `${STATE_NS}:pr:${owner}/${repo}:${prNumber}`;
}

function outboundEchoKey(owner: string, repo: string, ghNumber: number): string {
  return `${STATE_NS}:outbound-echo:${owner}/${repo}:${ghNumber}`;
}

export async function getIssueMapping(
  ctx: PluginContext,
  owner: string,
  repo: string,
  ghNumber: number,
): Promise<IssueMapping | null> {
  return await ctx.state.get({
    scopeKind: "instance",
    stateKey: issueKey(owner, repo, ghNumber),
  }) as IssueMapping | null;
}

export async function setIssueMapping(
  ctx: PluginContext,
  owner: string,
  repo: string,
  ghNumber: number,
  paperclipIssueId: string,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: issueKey(owner, repo, ghNumber) },
    { paperclipIssueId },
  );
}

export async function getPrMapping(
  ctx: PluginContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrMapping | null> {
  return await ctx.state.get({
    scopeKind: "instance",
    stateKey: prKey(owner, repo, prNumber),
  }) as PrMapping | null;
}

export async function setPrMapping(
  ctx: PluginContext,
  owner: string,
  repo: string,
  prNumber: number,
  paperclipIssueId: string,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: prKey(owner, repo, prNumber) },
    { paperclipIssueId },
  );
}

/**
 * Record that a Paperclip issue was successfully pushed to GitHub.
 * Written AFTER the GitHub API call succeeds so that a failed API call
 * does not silently block retries.
 *
 * Keyed by owner/repo/ghNumber so the inbound webhook handler can match it
 * against the real GitHub issue number instead of an internal Paperclip UUID.
 */
export async function markOutboundIssueEcho(
  ctx: PluginContext,
  owner: string,
  repo: string,
  ghNumber: number,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: outboundEchoKey(owner, repo, ghNumber) },
    { ts: Date.now() } satisfies OutboundEchoRecord,
  );
}

/**
 * Check and consume an outbound-echo marker.
 *
 * Returns true  → the inbound "issues:opened" webhook is our own echo; skip issue creation.
 * Returns false → this is a genuine external event; proceed normally.
 *
 * The marker is deleted on first consumption (single-use) to avoid suppressing
 * legitimate subsequent events for the same issue number.
 */
export async function consumeOutboundIssueEcho(
  ctx: PluginContext,
  owner: string,
  repo: string,
  ghNumber: number,
): Promise<boolean> {
  const key = outboundEchoKey(owner, repo, ghNumber);
  const raw = await ctx.state.get({ scopeKind: "instance", stateKey: key }) as OutboundEchoRecord | null;
  if (!raw || typeof raw.ts !== "number" || !Number.isFinite(raw.ts)) return false;
  if (Date.now() - raw.ts > 30_000) return false; // TTL expired — treat as genuine event
  await ctx.state.delete({ scopeKind: "instance", stateKey: key }); // consume once
  return true;
}
