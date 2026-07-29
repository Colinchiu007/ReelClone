/**
 * 用户协议页
 *
 * 必备条款：
 * 1. 服务说明
 * 2. 用户注册与账号
 * 3. 用户行为规范
 * 4. 虚拟物品说明
 * 5. 退款政策
 * 6. 知识产权
 * 7. 免责声明
 * 8. 服务变更与终止
 * 9. 争议解决
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

/** 用户协议富文本节点 */
const AGREEMENT_NODES: RichTextNode[] = [
  { type: 'node', name: 'h1', children: [{ type: 'text', text: 'ReelClone 用户协议' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '请您在使用 ReelClone（以下简称"本平台"）服务前，仔细阅读并充分理解本协议的全部内容。您点击同意或使用本平台服务即视为您已阅读并同意本协议的全部条款。',
      },
    ],
  },

  // 1. 服务说明
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '一、服务说明' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '本平台是一款面向内容创作者的 AI 短视频创作工具，提供文本生成、图片生成、视频生成、对标解析、模板广场、套餐积分等一站式 AI 创作能力。本平台由 ReelClone 团队运营，具体服务内容以本平台实际提供的为准。',
      },
    ],
  },

  // 2. 用户注册与账号
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '二、用户注册与账号' }] },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '1. 您可通过微信授权登录注册本平台账号；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 为保障账号安全与订单联系，建议您绑定手机号码。绑定后手机号可用于身份验证与重要通知；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 您应确保注册信息真实、准确，并对账号下的所有活动负责。账号仅供您本人使用，不得转让、出借或售卖；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 如您发现账号被盗用或存在安全风险，应立即联系客服。因您未妥善保管账号导致的损失，本平台不承担责任。',
      },
    ],
  },

  // 3. 用户行为规范
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '三、用户行为规范' }] },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '您在使用本平台服务时，应遵守中华人民共和国法律法规，不得利用本平台从事以下行为：' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '1. 发布或生成含有反动、色情、暴力、恐怖、赌博、毒品等违法内容；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '2. 侵犯他人知识产权、肖像权、隐私权等合法权益；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '3. 滥用 AI 生成内容进行虚假宣传、诈骗、诽谤、造谣等；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '4. 对本平台进行逆向工程、爬虫抓取、压力测试等破坏性操作；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '5. 以任何方式干扰本平台正常运营或损害其他用户体验。' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '如您违反上述规范，本平台有权采取内容删除、账号封禁、拒绝服务等措施，并保留追究法律责任的权利。',
      },
    ],
  },

  // 4. 虚拟物品说明
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '四、虚拟物品说明' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 本平台提供的积分与套餐属于虚拟物品，购买后仅可在本平台内用于消费 AI 生成服务；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 积分与套餐有效期限以购买页面标注为准，过期未使用的积分将自动失效；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 虚拟物品一经购买，非质量问题不予退换。请您在购买前确认套餐内容与积分数量。',
      },
    ],
  },

  // 5. 退款政策
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '五、退款政策' }] },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '1. 生成失败自动退款：因平台原因导致生成任务失败或超时，系统将自动退还已冻结的积分；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [{ type: 'text', text: '2. 内容审核未通过退款：生成内容未通过内容安全审核时，系统将自动退还已冻结的积分；' }],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 套餐未使用部分退款：如您购买的套餐中积分尚未使用且在有效期内，可向客服申请按未使用比例退款，退款将原路返回至支付账户；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 已使用积分不予退款。退款申请处理时间为 3-7 个工作日。',
      },
    ],
  },

  // 6. 知识产权
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '六、知识产权' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 本平台的软件、算法、模板、UI 设计等知识产权归本平台所有，未经授权不得复制、传播或商用；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 您通过本平台生成的内容（视频、图片、文本）归您所有，但您应确保生成内容不侵犯第三方权益；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 您授予本平台非排他性的、免费的、全球范围内的使用权，用于存储、传输、展示您生成的内容以提供本服务；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 本平台可使用匿名化、聚合化的生成数据用于算法优化与产品改进，但不会披露您的个人信息。',
      },
    ],
  },

  // 7. 免责声明
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '七、免责声明' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 本平台 AI 生成内容基于大模型概率输出，可能存在不准确、不完整或偏颇之处，仅供参考，您应自行判断并对使用后果承担责任；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 本平台不对生成内容的合法性、准确性、适用性作出任何明示或默示的保证；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 因不可抗力、系统维护、网络故障、第三方服务中断等导致的服务中断或数据丢失，本平台不承担责任；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '4. 您因使用生成内容产生的任何纠纷与法律责任，由您自行承担。',
      },
    ],
  },

  // 8. 服务变更与终止
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '八、服务变更与终止' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 本平台可根据业务发展需要变更、暂停或终止部分或全部服务，并将提前通过应用内通知或公告告知您；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 服务终止时，您未使用的积分将按退款政策处理；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 如您违反本协议，本平台有权随时限制、暂停或终止您的账号使用权限。',
      },
    ],
  },

  // 9. 争议解决
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '九、争议解决' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '1. 本协议的订立、执行与解释均适用中华人民共和国法律；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '2. 因本协议或本服务产生的争议，双方应首先友好协商解决；协商不成的，任何一方均可向本平台运营方所在地有管辖权的人民法院提起诉讼；',
      },
    ],
  },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '3. 本协议条款如有与法律法规相抵触的，以法律法规为准，其余条款继续有效。',
      },
    ],
  },

  // 联系方式
  { type: 'node', name: 'h2', children: [{ type: 'text', text: '十、联系方式' }] },
  {
    type: 'node',
    name: 'p',
    children: [
      {
        type: 'text',
        text: '如您对本协议有任何疑问，可通过邮箱 support@reelclone.com 联系我们。',
      },
    ],
  },
];

export default function UserAgreementPage() {
  return (
    <ScrollView scrollY className='user-agreement-page'>
      <RichText className='user-agreement-page__content' nodes={AGREEMENT_NODES as unknown as string} />
    </ScrollView>
  );
}
