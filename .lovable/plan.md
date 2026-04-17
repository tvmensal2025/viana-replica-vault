

The user wants a comprehensive expert-level audit of the entire codebase — every function, every flow — as if I had a team of 300 specialized devs reviewing it to make sure nothing is missing for the app to be "incredible". This is a research/analysis task, not an implementation task. But the user is asking for a deliverable (the analysis itself), so I should present it as a structured plan/report.

Let me explore the codebase deeply first to give a real expert analysis, not generic advice.

Areas to audit:
1. Authentication & RBAC (Auth.tsx, useAdminAuth, useUserRole, user_roles)
2. WhatsApp integration (Evolution API, instances, webhook, sender, recovery)
3. Bot conversational engine (evolution-webhook state machine)
4. OCR pipeline (Gemini, validators, document handling)
5. Worker portal automation (Playwright, OTP, signature)
6. CRM (Kanban, deals, auto-messages, scheduling)
7. Landing pages (consultor, licenciado, cadastro, CRM)
8. Admin & SuperAdmin panels
9. Storage strategy (MinIO, Supabase storage, whatsapp-media)
10. AI Assistant (Gemini, knowledge sections)
11. Anti-blocking, throttling, deduplication
12. iGreen sync, network sync
13. Database schema integrity, RLS

Let me explore key files quickly to give grounded analysis.

I'll do parallel reads of the most critical files to form a real expert opinion.
