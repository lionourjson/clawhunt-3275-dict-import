import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'tdesign-react/es/style/index.css';
import { enableMocking } from './mocks/browser';

// 浏览器端启用 MSW mock（Vitest 里走 msw/node，不经过这里）。
// 真实接入后端时删除这两行引用即可（见 README 集成点）。
enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
