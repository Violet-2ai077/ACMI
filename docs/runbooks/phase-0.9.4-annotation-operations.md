# 本地标注操作

生成开放 rehearsal 包：`node scripts/phase-0.9.4/corpus.mjs <new-output-dir>`。选择 A/B lane 并分别分发，只把映射保存在协调员目录；开发者公开复现用映射并非独立保管。空模板不可直接提交。

```text
node scripts/phase-0.9.4/annotation.mjs compare A.json B.json map.json sub-A.json sub-B.json compare-new.json
node scripts/phase-0.9.4/annotation.mjs adjudicate A.json B.json map.json sub-A.json sub-B.json adjudication-new.json decision.json
```

没有提交的路径用 `-`。第二条只处理真实独立仲裁，不能输入自动 Gold。报告和仲裁保存在私有目录，每次使用新文件名，不覆盖。真实提交不进 Git/ZIP。核验、分发、接收和身份审计由协调员执行。
