import { useSyncExternalStore } from 'react';
import { canImport, currentDemoActor, DEMO_ACTOR_EVENT, DEMO_TOKEN_KEY } from './demoAuth';

function subscribe(onChange: () => void) {
  window.addEventListener(DEMO_ACTOR_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(DEMO_ACTOR_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export default function ImportGuard({ children }: { children: React.ReactNode }) {
  useSyncExternalStore(subscribe, () => sessionStorage.getItem(DEMO_TOKEN_KEY), () => null);
  const actor = currentDemoActor();
  if (!canImport(actor)) {
    return <section role="alert"><h1>无权访问字典导入</h1><p>请使用具备字典导入权限的工作台身份。</p></section>;
  }
  return <>{children}</>;
}
