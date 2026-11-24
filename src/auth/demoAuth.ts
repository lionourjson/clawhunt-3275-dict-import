// S2-WB identity adapter for the standalone MSW demo. Public fixture tokens are NOT credentials.
// Replace this entire adapter with the host's authenticated session and server-side authorization.
export const DEMO_TOKEN_KEY = 'dict-import-demo-actor';
export const DEMO_ACTOR_EVENT = 'dict-import-demo-actor-changed';

export interface DemoActor {
  token: string;
  id: string;
  role: 'operator' | 'viewer';
  orgId: string;
  siteId: string;
}

const actors: Record<string, DemoActor> = {
  'demo-operator': { token: 'demo-operator', id: 'operator-1', role: 'operator', orgId: 'org-demo-001', siteId: 'site-demo-001' },
  'demo-viewer': { token: 'demo-viewer', id: 'viewer-1', role: 'viewer', orgId: 'org-demo-001', siteId: 'site-demo-001' },
  'demo-operator-peer': { token: 'demo-operator-peer', id: 'operator-4', role: 'operator', orgId: 'org-demo-001', siteId: 'site-demo-001' },
  'demo-other-org': { token: 'demo-other-org', id: 'operator-2', role: 'operator', orgId: 'org-demo-002', siteId: 'site-demo-001' },
  'demo-other-site': { token: 'demo-other-site', id: 'operator-3', role: 'operator', orgId: 'org-demo-001', siteId: 'site-demo-002' },
};

// Server-side MSW fixture resolves the token independently of request-provided org/site fields.
export function resolveDemoActor(token: string | null): DemoActor | null {
  return token && actors[token] ? actors[token] : null;
}

export function currentDemoActor(): DemoActor | null {
  return resolveDemoActor(sessionStorage.getItem(DEMO_TOKEN_KEY));
}

export function setDemoActor(token: string | null): void {
  if (token) sessionStorage.setItem(DEMO_TOKEN_KEY, token);
  else sessionStorage.removeItem(DEMO_TOKEN_KEY);
  window.dispatchEvent(new Event(DEMO_ACTOR_EVENT));
}

export function canImport(actor: DemoActor | null): actor is DemoActor {
  return !!actor && actor.role === 'operator';
}
