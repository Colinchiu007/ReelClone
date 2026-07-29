/**
 * 隐私协议页
 * 对应 FR6_设置_03_隐私协议入口
 *
 * - 使用 RichText 组件展示富文本
 * - 包含：信息收集 / 信息使用 / 信息共享 / 信息安全 / 用户权利 / 儿童隐私 / 变更通知 / 联系我们
 *
 * RichText 节点结构（小程序原生支持 nodes 数组）：
 * 每个章节使用 h2 标题 + 多段 p 文本
 */
import { ScrollView, RichText } from '@tarojs/components';
import './index.scss';

/** RichText 节点类型（与小程序原生 nodes 结构一致） */
interface RichTextNode {
  type: 'node' | 'text';
  name?: string;
  attrs?: Record<string, string>;
  children?: RichTextNode[];
  text?: string;
}

/** 隐私协议富文本节点 */
const PRIVACY_NODES: RichTextNode[] = [
  { type: 'node', name: 'h1', children: [{ type: 'text', text: 'ReelClone 隐私协议' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '本协议描述了 ReelClone（以下简称"我们"）如何收集、使用、共享、保护和处理您的个人信息。请您在使用我们的服务前，仔细阅读并充分理解本协议的全部内容。',
      },
    ],
  },

  // 1. 信息收集
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '一、信息收集' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '我们在您使用 ReelClone 服务时会收集以下信息：',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 账户信息：包括您的微信 OpenID、UnionID、微信昵称、头像等用于身份识别的信息；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 手机号码：在您主动绑定时收集，用于账户安全验证与重要通知；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 使用记录：包括您的创作内容、生成历史、积分消费记录、订单记录等；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 设备信息：包括设备型号、操作系统版本、网络环境等，用于服务优化与问题排查。',
      },
    ],
  },

  // 2. 信息使用
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '二、信息使用' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '我们收集的信息将用于以下目的：',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '1. 提供并优化 AI 视频创作服务；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '2. 验证您的身份并保障账户安全；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '3. 处理您的订单与积分计费；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '4. 提供客户服务与技术支持；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '5. 改进产品功能与用户体验（仅使用匿名化数据）。' }],
  },

  // 3. 信息共享与第三方 SDK
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '三、信息共享与第三方 SDK' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '除以下情形外，我们不会向任何第三方共享您的个人信息：',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '1. 获得您的明确同意后；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 与第三方 AI 服务商共享必要数据以完成生成任务（详见下方第三方 SDK 清单）；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '3. 与微信支付共享订单信息以完成支付流程；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 根据法律法规要求或政府主管部门的强制要求。',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '我们接入的第三方 SDK 及其信息处理情况如下：' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '（1）阿里云 OSS SDK：用于存储您上传的素材与生成的视频/图片作品。处理的信息包括文件内容、文件名、用户 ID。提供方：阿里云计算有限公司。隐私政策见阿里云官网。',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '（2）阿里云短信服务 SDK：用于发送手机号绑定验证码。处理的信息包括手机号码。提供方：阿里云计算有限公司。',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '（3）微信支付 SDK：用于完成套餐订阅与积分购买订单的支付。处理的信息包括订单号、支付金额、用户 OpenID。提供方：财付通支付科技有限公司。',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '（4）Seedance AI 视频生成服务：用于根据文本/图片生成视频内容。处理的信息包括提示词、参考图、生成参数。提供方：字节跳动（火山引擎）。',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '（5）通义千问 / 豆包大语言模型 SDK：用于文本生成、对标解析、提示词优化等 AI 文本能力。处理的信息包括用户输入的文本内容。提供方：阿里云计算有限公司 / 字节跳动。',
      },
    ],
  },

  // 4. 数据存储与保护
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '四、数据存储与保护' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 存储位置：您的个人信息存储于中华人民共和国境内的阿里云华东节点（上海/杭州）服务器上，跨境传输需经单独评估与您的同意；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 存储期限：账户信息在您账户存续期间保留；生成内容、订单与积分记录在账户注销后保留 180 天（用于审计与售后），期满后删除或匿名化；短信验证码保留 5 分钟；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 加密方式：数据传输采用 HTTPS/TLS 1.2+ 加密；手机号、OpenID 等敏感信息在数据库中采用 AES-256 加密存储；OSS 私有文件通过签名 URL 访问；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 安全措施：访问权限分级控制（RBAC）、操作审计日志、数据库审计、定期安全扫描、最小权限原则。我们会持续提升安全能力以防范信息泄露、损毁或丢失风险。',
      },
    ],
  },

  // 5. 用户权利
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '五、用户权利' }] },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '您对个人信息享有以下权利：' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '1. 查询权：您可在"设置"中查看您的账户信息与使用记录；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '2. 更正权：您可修改昵称、绑定手机号等账户信息；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 删除权：您可联系客服申请删除您的账户及相关数据；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '4. 撤回同意权：您可随时停止使用相关功能以撤回授权。' }],
  },

  // 6. 儿童隐私
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '六、儿童隐私' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: 'ReelClone 服务面向成年人，我们不主动收集 14 岁以下儿童的个人信息。如果您是未成年人的监护人，发现您的孩子使用了我们的服务，请及时联系我们，我们将删除相关信息。',
      },
    ],
  },

  // 7. 变更通知
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '七、变更通知' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '本隐私协议可能因业务调整或法律法规变化而更新。协议更新后，我们将在应用内显著位置或通过推送消息通知您。继续使用服务即视为您同意更新后的协议。',
      },
    ],
  },

  // 8. 联系我们
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '八、联系我们' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '如您对本协议有任何疑问、意见或建议，可通过以下方式联系我们：',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '邮箱：privacy@reelclone.com' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '我们将在收到您的反馈后 15 个工作日内予以回复。' }],
  },
];

export default function PrivacyPage() {
  return (
    <ScrollView scrollY className='privacy-page'>
      <RichText className='privacy-page__content' nodes={PRIVACY_NODES as unknown as string} />
    </ScrollView>
  );
}
