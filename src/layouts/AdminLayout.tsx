import { Layout, Menu } from 'tdesign-react';
import MenuItem from 'tdesign-react/es/menu/MenuItem';
import { NavLink, Outlet } from 'react-router-dom';

const { Aside, Content, Header } = Layout;

/** TDesign 工作台布局：侧边栏 + 顶栏 + 内容区。 */
const NAV = [
  { path: '/admin/taxonomy/import', label: '字典导入' },
  { path: '/admin/demo', label: '工作台演示' },
  { path: '/admin/members', label: '会员列表' },
  { path: '/admin/tags', label: '标签树' },
];

export default function AdminLayout() {
  return (
    <Layout style={{ height: '100vh' }}>
      <Aside width="220px">
        <Menu style={{ height: '100%' }}>
          <div style={{ padding: '16px', fontWeight: 600 }}>会员空间平台</div>
          {NAV.map((item) => (
            <MenuItem key={item.path} icon={<span aria-hidden>·</span>}>
              <NavLink to={item.path} style={{ color: 'inherit', textDecoration: 'none' }}>
                {item.label}
              </NavLink>
            </MenuItem>
          ))}
        </Menu>
      </Aside>
      <Layout>
        <Header style={{ background: 'var(--td-bg-color-container, #fff)', padding: '12px 24px', borderBottom: '1px solid var(--td-border-level-1-color, #e7e7e7)' }}>
          <strong>管理工作台</strong>
          <span style={{ marginLeft: 12, color: 'var(--td-text-color-placeholder, #a0a0a0)' }}>
            字典与标签中心
          </span>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto', background: 'var(--td-bg-color-page, #f3f3f3)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
