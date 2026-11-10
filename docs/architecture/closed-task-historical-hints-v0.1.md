# Closed Task Historical Hints v0.1

活动视图最多八项，历史视图最多两项。仅当前授权 Workspace、当前 catalog revision 且经过对象 ACL 的已关闭 Task 才能出现。历史提示优先明确 ID、别名或受控词法相关性；不会随 workspace recent 回退，不披露无关外域 Task，也不占 active 配额。历史条目的 `bindable` 固定 false、handle 使用独立 `h` 命名空间，省略 active WorkNode，不参与当前执行目标回退。基于历史提示的恢复仍是解释/澄清，不能变成 reopen、bind、Graph write 或自动新建。

Graph validator 只接纳当前 active handle 作为可用 Task 身份。已关闭 Task 要求独立显式 Host 操作才能改变状态；本阶段没有接入此写入口。
