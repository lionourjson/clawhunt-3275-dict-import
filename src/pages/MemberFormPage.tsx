import { Form, Button, Input, Select } from 'tdesign-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../api/client';
import { yuanToFen } from '../lib/money';

const { FormItem } = Form;

/** 表单页模板：字段校验（必填/手机号/金额），提交调 mock 接口，金额元→分。 */
interface FormValues {
  name: string;
  phone: string;
  level: 'basic' | 'silver' | 'gold';
  balanceYuan: string;
}

function validatePhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

export default function MemberFormPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async ({ validateResult, firstError }: { validateResult: unknown; firstError?: string }) => {
    if (validateResult !== true) {
      setSubmitError(`校验未通过：${firstError ?? ''}`);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const values = form.getFieldsValue(['name', 'phone', 'level', 'balanceYuan']) as unknown as FormValues;
      const fen = yuanToFen(values.balanceYuan || '0');
      if (!Number.isInteger(fen)) {
        throw new Error('金额格式不正确');
      }
      await apiPost<
        { name: string; phone: string; level: string; balance_cents: number },
        { id: string }
      >('/members', {
        name: values.name,
        phone: values.phone,
        level: values.level,
        balance_cents: fen,
      });
      setSuccess(true);
      setTimeout(() => navigate('/admin/members'), 1200);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Form form={form} onSubmit={onSubmit} labelWidth={110} data-testid="member-form">
        <FormItem label="会员名" name="name" rules={[{ required: true, message: '请输入会员名（必填）' }]}>
          <Input placeholder="演示会员X（虚构）" clearable />
        </FormItem>
        <FormItem
          label="手机号"
          name="phone"
          rules={[
            { required: true, message: '请输入手机号' },
            { validator: (v: string) => validatePhone(v), message: '手机号须为 1 开头的 11 位数字' },
          ]}
        >
          <Input placeholder="13800000000（虚构）" />
        </FormItem>
        <FormItem label="等级" name="level" initialData="basic" rules={[{ required: true, message: '请选择等级' }]}>
          <Select
            options={[
              { label: '基础', value: 'basic' },
              { label: '白银', value: 'silver' },
              { label: '黄金', value: 'gold' },
            ]}
          />
        </FormItem>
        <FormItem
          label="储值余额（元）"
          name="balanceYuan"
          rules={[
            { required: true, message: '请输入储值余额' },
            { validator: (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0, message: '金额须为不小于 0 的数字（以分存整数提交）' },
          ]}
        >
          <Input placeholder="例如 12.34 → 提交 1234 分" />
        </FormItem>
        <FormItem>
          <Button theme="primary" type="submit" disabled={submitting} data-testid="member-form-submit">
            {submitting ? '提交中...' : '提交'}
          </Button>
          {submitError && (
            <span role="alert" data-testid="member-form-error" style={{ marginLeft: 12, color: 'var(--td-error-color, #d54941)' }}>
              {submitError}
            </span>
          )}
          {success && (
            <span data-testid="member-form-success" style={{ marginLeft: 12, color: 'var(--td-success-color, #2ba471)' }}>
              已提交成功，即将跳转列表页
            </span>
          )}
        </FormItem>
      </Form>
    </div>
  );
}
