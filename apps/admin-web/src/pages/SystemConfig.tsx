import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Button, Tag, Modal, Form, Select, Input, message, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, KeyOutlined } from '@ant-design/icons'
import { listApiKeys, updateApiKeys, type ApiKeyStatus, type ApiKeyProvider } from '../api/admin'

interface KeyFormValues {
  provider: ApiKeyProvider
  keys: string
}

const providerLabel: Record<ApiKeyProvider, string> = {
  seedance: 'Seedance（视频生成）',
  llm: 'LLM（大语言模型）',
  oss: 'OSS（对象存储）',
}

const providerOptions = [
  { label: 'Seedance（视频生成）', value: 'seedance' },
  { label: 'LLM（大语言模型）', value: 'llm' },
  { label: 'OSS（对象存储）', value: 'oss' },
]

export default function SystemConfig() {
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<ApiKeyStatus[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [form] = Form.useForm<KeyFormValues>()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listApiKeys()
      setProviders(result.providers ?? [])
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const openUpdate = (providerName?: ApiKeyProvider) => {
    form.resetFields()
    form.setFieldsValue({ provider: providerName ?? 'seedance', keys: '' })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitLoading(true)
    try {
      const keys = values.keys
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      await updateApiKeys(values.provider, keys)
      message.success(`已更新 ${values.provider} 的 Key 配置`)
      setModalOpen(false)
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setSubmitLoading(false)
    }
  }

  const columns: ColumnsType<ApiKeyStatus> = [
    {
      title: 'Provider',
      dataIndex: 'name',
      width: 200,
      render: (v: string) => providerLabel[v as ApiKeyProvider] ?? v,
    },
    {
      title: 'Key 数量',
      dataIndex: 'keyCount',
      width: 120,
    },
    {
      title: '状态',
      dataIndex: 'hasKeys',
      width: 120,
      render: (v: boolean) => (v ? <Tag color="green">已配置</Tag> : <Tag color="red">未配置</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_v: unknown, record: ApiKeyStatus) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => openUpdate(record.name as ApiKeyProvider)}
        >
          更新 Key
        </Button>
      ),
    },
  ]

  return (
    <>
      <Card
        title="API Key 管理"
        extra={
          <Button type="primary" icon={<KeyOutlined />} onClick={() => openUpdate()}>
            更新 Key
          </Button>
        }
      >
        <Table
          rowKey="name"
          columns={columns}
          dataSource={providers}
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title="更新 API Key"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitLoading}
        okText="保存"
        width={560}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Form<KeyFormValues> form={form} layout="vertical">
            <Form.Item
              name="provider"
              label="Provider"
              rules={[{ required: true, message: '请选择 Provider' }]}
            >
              <Select options={providerOptions} />
            </Form.Item>
            <Form.Item
              name="keys"
              label="Key 列表（每行一个，覆盖式更新）"
              rules={[{ required: true, message: '请输入 Key' }]}
            >
              <Input.TextArea
                rows={6}
                placeholder="每行一个 API Key（覆盖式更新，留空将清空）"
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
          </Form>
          <Tag color="orange" style={{ alignSelf: 'flex-start' }}>
            安全提示：Key 输入框以密文存储，提交后不再返回明文
          </Tag>
        </Space>
      </Modal>
    </>
  )
}
