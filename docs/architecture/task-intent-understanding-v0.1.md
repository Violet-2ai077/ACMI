# Task Intent Understanding v0.1

The five intent outcomes are `continue_current`, `switch_existing`, `create_new`, `no_task`, and `uncertain`. The last two are deliberately different: only a recognized standalone acknowledgement is `no_task`; ambiguity, conflicting cues, an absent candidate, or insufficient evidence yields `uncertain`. A uniquely named allowlisted alias or exact UUID may select an existing Task. Similar objectives, Assistant plans and Tool output do not establish identity.

The Host selects the current Task and up to eight candidate IDs from its authorized Workspace. The store resolves their summaries and revisions; unknown IDs fail closed, closed candidates are omitted, and no request enumerates all Tasks. Routing is a recommendation. Even an accepted routing receipt does not create a Task or bind a Session. A fresh Workspace without any Task stream must be explicitly bootstrapped by the Host before using the durable inbox. An empty candidate list can yield `create_new` without fabricating a UUID.

The rules are a conservative cue grammar, not unrestricted intent inference. Scripted outputs may propose structure but cannot override the routing class or invent a Task identity.
