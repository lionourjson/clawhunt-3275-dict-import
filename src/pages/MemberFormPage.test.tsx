import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MemberFormPage from './MemberFormPage';

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/admin/members/new']}>
      <MemberFormPage />
    </MemoryRouter>,
  );
}

describe('MemberFormPage（表单页：校验）', () => {
  it('空表单提交显示必填校验错误', async () => {
    renderForm();
    fireEvent.click(screen.getByTestId('member-form-submit'));
    await waitFor(() => expect(screen.getByTestId('member-form-error')).toBeInTheDocument());
    expect(screen.getByTestId('member-form-error').textContent).toContain('校验未通过');
    // 必填项出现错误提示
    await waitFor(() => expect(screen.getAllByText(/请输入/).length).toBeGreaterThan(0));
  });

  it('手机号非法时显示格式错误', async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('13800000000（虚构）'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('member-form-submit'));
    await waitFor(() =>
      expect(screen.getByText('手机号须为 1 开头的 11 位数字')).toBeInTheDocument(),
    );
  });

  it('金额非法时显示格式错误', async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('例如 12.34 → 提交 1234 分'), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('member-form-submit'));
    await waitFor(() =>
      expect(screen.getByText('金额须为不小于 0 的数字（以分存整数提交）')).toBeInTheDocument(),
    );
  });

  it('合法数据提交成功并出现成功提示', async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('演示会员X（虚构）'), { target: { value: '测试会员甲' } });
    fireEvent.change(screen.getByPlaceholderText('13800000000（虚构）'), { target: { value: '13800001234' } });
    fireEvent.change(screen.getByPlaceholderText('例如 12.34 → 提交 1234 分'), { target: { value: '12.34' } });
    fireEvent.click(screen.getByTestId('member-form-submit'));
    await waitFor(() => expect(screen.getByTestId('member-form-success')).toBeInTheDocument());
  });
});
