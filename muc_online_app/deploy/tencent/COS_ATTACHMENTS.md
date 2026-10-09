# COS 附件上传校验权限

生产存储桶：`ceairm-production-1449362740`（`ap-beijing`）。
应用子账号：`ceairm-cos-production`。
CAM 策略：`CeairmProductionCosObjectAccess`。

`cos-object-access-policy.json` 是本项目所需的对象操作策略，保留当前桶资源范围，并在原 GetObject、PutObject、DeleteObject 操作上增加 HeadObject。桶应保持私有读写。该文件不含凭据。

发布前在 CAM 核对当前生效策略与此文件一致。发布流水线只更新应用代码，不会自动修改 CAM 策略；新增服务器或更换子账号后，也必须核对 HeadObject 权限。

附件流程：浏览器 PUT 上传 → 服务端 HEAD 校验 → 登记附件索引。GetObject 不能替代 HeadObject 授权。权限拒绝会返回 COS_UPLOAD_CHECK_FORBIDDEN；404 才返回 COS_UPLOAD_OBJECT_NOT_FOUND。网络、服务异常及大小不一致分别返回对应错误码，服务端日志保留 COS 请求编号，不记录签名 URL 或密钥。

验收时确认 PUT 成功、HEAD 成功且附件登记接口返回 201，之后验证下载。已上传但未登记的对象不能仅凭文件名自动关联，需要核对所属信息、附件 ID 和文件大小后再恢复索引。

官方说明：https://cloud.tencent.com/document/product/436/7745
