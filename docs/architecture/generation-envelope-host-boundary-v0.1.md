# Generation Envelope 的 Host 边界

| 边界 | 实验控制 |
| --- | --- |
| Model input | 仅冻结合成目录，真值与 UUID 不进 prompt；Native 当前 User 内容和事件身份交叉核对 |
| Transport | 只连接本机 IPv4 127.0.0.1 的允许路由；权重和关键 runtime 工件摘要核对；一次性认证；无重试和下载 |
| Model output | 不信任 schema 外内容；明确界限、保留字/私有值检查、引文验证、严格 allowlist |
| Native dsh | 只接收已拆分文本、登记过的合成工具参数和原生 usage；不使用会持久化的 replayState |
| Persistence | 实验 sidecar 证据与隔离原生 Journal 分开；不向 Core/Graph/Binding/Outcome/Join 暴露写接口 |

字面 echo 检查不证明能防任意隐写、编码或语义转述。隔离 fixture 不授予自由插件、不读用户历史、不处理真实数据，不能作为生产安全资格。
