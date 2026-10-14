# Case Scope

## meta
- case_id: security-review
- created: 2026-10-13T21:37:21.2332254+03:00
- operator: local
- project_root: D:\Coding\reverse_office\reverse_office
- primary_skill: code-audit/SKILL.md
- primary_id: R26
- lead_role: lead
- specialist_roles: []
- hint: source code audit own workspace
- preset: own-system

## auth
- status: granted
- basis: own_system
- evidence_of_auth: User explicitly requested building and testing this local repository
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - http://127.0.0.1:3001
  - http://localhost:3102 (isolated native editor test app)
  - http://localhost:8082 (owned local document engine)
  - D:\Coding\reverse_office\reverse_office
- surfaces: []
- activities: []

## out_of_scope
- assets: []
- activities: [dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: lab_only
- notes: |
    offline | lab_only | authorized_target_only | unrestricted_lab
    Change mode only after auth.status = granted.

## deliverables
- report: true
- field_journal: true
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: anonymize

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [ ] out_of_scope reviewed
  - [ ] roles assigned (see skills/ops/role-map.md)

## ops_refs
- skills/ops/scope-contract.md
- skills/ops/evidence-finding-path.md
- skills/ops/role-map.md
- skills/ops/timeline-workitem.md
- skills/ops/IDENTITY.md
