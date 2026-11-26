# Role-prep harness: research findings

Date: 2026-11-26. Scope: what a personalized harness for deeply technical roles and their interviews needs, checked against what the LearnHarness core loop does today. The first target is research engineer roles in video generation, image generation, world models and RL post-training for generative models. Terms follow `../../GLOSSARY.md`. Repo paths are relative to the repo root on branch `gen-media` unless marked `upstream/feature/session-kinds:`.

Method: web claims come from company career pages, ATS postings (Ashby, Greenhouse, Workable, NVIDIA's API), official docs and original papers, all fetched on 2026-11-26. Quotes are verbatim and short. "Unconfirmed" means the page did not load or the claim is not stated in the source.

---

## 1. Roles and interviews

### 1.1 Official interview-process pages

| Company | Source | Stated stages |
|---|---|---|
| OpenAI | https://openai.com/interview-guide/ | Résumé review, intro calls ("discuss your work and academic experience"), then a skills assessment that "may include: pair coding interviews, take-home projects, technical tests". Finals are "4–6 hours of final interviews with 4–6 people over 1–2 days". Engineering criteria: "well-designed solutions… high-quality code, optimal performance, and good test coverage". AI tools: "Expectations… vary by interview". Named prep reading: Deep Learning Book, Spinning Up in Deep RL. |
| Google DeepMind | https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf | "Initial interviews → Skills interviews → Final interviews → Decision and offer". Skills: "two or three further calls… against the competencies". "Competency-based approach… recommend using the STAR method". "Explain your reasoning and explore creative solutions". 4–10 weeks. "Please don't use any AI tools during live interviews, or during interview tasks." Role-specific details go only to invited candidates. |
| Anthropic | https://www.anthropic.com/careers, https://www.anthropic.com/candidate-ai-guidance | "For technical roles, we use live coding tools like Colab and CodeSignal." Take-homes: "Complete these without Claude unless we indicate otherwise." Live interviews: "no AI assistance unless we indicate otherwise." One posting (Production Model Post-Training, https://job-boards.greenhouse.io/anthropic/jobs/5112018008) says "we conduct all interviews in Python". |
| NVIDIA | https://www.nvidia.com/en-us/about-nvidia/careers/how-we-hire/ | Phone, then virtual or in-person interviews of "30-60 minutes each". There may be a coding exercise, typically on HackerRank. An offer requires "an onsite, in-person interview". Using "unapproved outside tools, such as ChatGPT" disqualifies. |
| Black Forest Labs | https://bfl.ai/careers (FAQ text read from the page HTML) | Recruiter call, hiring manager conversation, "Assessment interviews — technical rounds and an experience deep-dive, sometimes with a take-home or live exercise", "a full day" onsite. Takes 2–3 weeks. AI allowed: "explain your approach, where AI supported your work." |
| Luma AI | https://lumalabs.ai/careers | Recruiter screen, hiring manager ("A deeper conversation with your potential manager"), team and leadership ("technical and cross-functional conversations"). Takes 2–3 weeks. |

No process page was found for Hugging Face, Runway, Pika, Odyssey, World Labs or Meta. Meta is unconfirmed: metacareers.com returned an empty shell to every fetch.

### 1.2 Target-role postings (live on 2026-11-26)

- **Pika**, Research Scientist, Post-Training — Video Generation (2026-11-06), https://jobs.ashbyhq.com/pika/d3993c91-4dd5-4868-8108-4e9b78133e7b: "own RL-based post-training for video diffusion/flow-matching models, develop state-of-the-art reward models"; "VLM-as-judge or large-scale preference data collection"; "temporal drift, motion and physics realism"; "multi-node distributed training".
- **Runway**, MTS Research Engineer (2026-01-09), https://jobs.ashbyhq.com/runway-ml/98e4b160-3bbe-4acd-b106-ad75ccc49675: "teach world models new behaviors — action following, scene manipulation, camera control"; "Design evaluations that measure model capabilities".
- **World Labs**, Research Scientist (Generative Modeling) (2025-12-29), https://jobs.ashbyhq.com/worldlabs/bbeed7cd-ba6b-4a3b-a02b-0e1744a0ec94: "large-scale diffusion models for generating 3D worlds"; "pre-training, post-training, diffusion distillation, fine-tuning with new conditioning signals"; "publications or open-source contributions".
- **Odyssey**, MTS Research (2026-06-26), https://jobs.ashbyhq.com/odysseyml/18ffb449-dcc4-42b2-a547-fb021fc1177b: "define a problem, design experiments to test it, and build the minimal system that proves what's possible"; "Have a real view on where this field needs to go next, and can defend it."
- **Luma**, RS/RE RL Infrastructure (2026-07-24), https://jobs.ashbyhq.com/lumaai/90734653-886d-4f6f-8af8-fb130d5400ab: "PPO/GRPO-family, RLHF, RLVR"; "reward-model serving, LLM-as-judge pipelines, and defenses against reward hacking"; "FSDP, Tensor/Pipeline/Expert Parallel".
- **NVIDIA**, Senior AI Researcher, World Foundation Models (2026-05-01), https://jobs.nvidia.com/careers/job/893395013952: "perceptual quality and temporal stability"; "Python, PyTorch, C++, and CUDA".
- **Google DeepMind**, Frontier AI Research Scientist (work feeds "Veo/Omni"), https://www.google.com/about/careers/applications/jobs/results/95821221060321990-frontier-ai-research-scientist-deepmind: "post-training techniques, particularly Reinforcement Learning and Reward Modeling at scale". The World Models and Generative Media RE URLs redirect to search, so they are likely closed (unconfirmed).
- **Anthropic**, RE/RS RL Frontiers, https://job-boards.greenhouse.io/anthropic/jobs/5438044008: "baselines, ablations, and enough statistical care"; "reason quantitatively about the compute, memory, and communication costs".
- **OpenAI**, RE/RS RL/Reasoning, https://jobs.ashbyhq.com/openai/7e198d81-34e0-48b6-b64e-a501a75f9d53: "simple experiments in tightly-controlled settings, and reaching trustworthy conclusions"; "diving into a large ML codebase to debug and improve it". No live Sora or image-gen research posting was found.
- **Hugging Face**, Open-Source ML Engineer (2026-05-29), https://apply.workable.com/huggingface/j/19A136F8E2: "public track record of open-source contributions… on GitHub". No RE/RS opening.
- **Black Forest Labs**: no posting confirmed, because every search-result Greenhouse URL redirects.

### 1.3 Adjacent roles

**ML systems / inference:**
- Anthropic Performance Engineer, Inference (https://job-boards.greenhouse.io/anthropic/jobs/5224564008): "profiling, roofline analysis, latency/throughput optimization"; "treat correctness as part of performance".
- Together AI MLE Inference (https://job-boards.greenhouse.io/togetherai/jobs/4385540007): "multi-threading, memory management, networking"; "speculative decoding"; "CUDA/Triton".
- Baseten Inference Performance (https://jobs.ashbyhq.com/baseten/7cb19a05-8e5b-44cf-b3e7-19949e2eff04): "prefill/decode disaggregation… KV-cache management"; "reason from first principles about where time and memory go".
- Modal Inference Runtime (https://jobs.ashbyhq.com/modal/6195f552-ca6f-4540-b7f6-e7e6054e47ad): "Rust and Go, diagnose difficult Linux and performance problems".

**RL research engineer:**
- Anthropic RE, ML (RL) (https://job-boards.greenhouse.io/anthropic/jobs/4613568008): "async/concurrent programming"; "Enjoy pair programming"; "strong systems design and communication skills"; "need not have… publication history".
- Anthropic RL Engineering (https://job-boards.greenhouse.io/anthropic/jobs/4952051008): "debugging, and improving a large ML codebase"; "controlled experiments".
- Baseten Post-Training RE (https://jobs.ashbyhq.com/baseten/68328a94-f785-463b-a3d7-b0dfc11839b5): "roofline analysis on a transformer training setup".
- Modal MTS Research, Post-Training (https://jobs.ashbyhq.com/modal/7db771eb-e379-47fe-974f-765a8780dc10): "first-author publications at leading venues".

None of the 11 adjacent postings states interview stages.

### 1.4 What recurs

Capabilities named across the postings:
- Diffusion and flow-matching depth: Pika, World Labs, NVIDIA, Odyssey.
- RL or preference post-training with reward models, judges and defenses against reward hacking: Pika, Luma, Anthropic, OpenAI, DeepMind.
- Distributed training at scale: Pika, Runway, Luma, Anthropic, NVIDIA.
- Experimental rigor and evaluation design: Anthropic, OpenAI, Runway, Odyssey.
- Quantitative cost reasoning: Anthropic, Baseten.
- Video-specific failure modes: Pika, NVIDIA.
- A public track record: World Labs, DeepMind, Hugging Face, Modal.

Stages named on the process pages: a recruiter or intro call, a manager conversation, technical rounds (pair or live coding at OpenAI, Anthropic and NVIDIA; take-homes at OpenAI and Black Forest Labs), an "experience deep-dive" (Black Forest Labs) or competency calls with STAR (DeepMind), and finals with the team and leadership. AI assistance is banned by default at Anthropic, DeepMind and NVIDIA.

**No official page names a research-presentation round, a paper-discussion round or an ML system-design round.** Treat all three as unconfirmed. The closest stated equivalents are "discuss your work" (OpenAI), "experience deep-dive" (Black Forest Labs) and Odyssey's "can defend it". Anthropic lists "systems design" as a skill, not as a stage.

### Implications for the product

- The stated interview surface has three parts: live coding in Python without AI help, technical depth on your own past work, and team or leadership conversations. The posting requirements are specific and quotable (reward hacking, temporal drift, roofline, KV cache), so a role can be modelled as a list of capability claims, each with its source URL.
- Paper discussion and system design are plausible formats, but no primary page confirms them. The product should not present them as known interview stages.
- Mock interviews must run without assistance (no side questions, no hints), because that is the stated condition at three of the six companies with a process page.
- Postings change weekly (two DeepMind postings closed while this was researched). Role profiles therefore need a fetch date and a refresh path.

---

## 2. What the core loop can do today

**Phases and tools.** Prober tools: `probe` or `recall`, `ask_user_question`, `probe_done`, read-only files, research and PDF dispatch, and gated graph readers. Teacher tools: `quiz` or `explain`, `ask_user_question`, `plan_init`, research, PDF, demo, visual and `show_image`. Practitioner tools: `problem`, `conclude`, files, research and PDF (`docs/architecture.md:70-74`). Session kind is `teach | practice` only (`src/core/contracts/chat.ts:19`).

**Prober.** It brackets a floor and a ceiling by binary search and prefers questions where "different mental models lead to different predictions" (`src/agent/prompts/prober/10-probe-doctrine.md:19-27`). It reads earlier coverage through `list_sessions` and `list_propositions` (`:11`). It hands off a strand-by-strand assessment, `ProbeAssessment {strands[{strand, assessment}], summary?}` (`src/core/contracts/probe.ts:19-31`).

**Teacher.**
- Plans a minimal tree as a Mermaid DAG (`src/agent/prompts/teacher/10-planning.md:9,19-23`) and rewrites it when the learner's answers show it is wrong (`:29`).
- Teaches one reasoning step at a time, choosing Socratic or expository delivery per step (`teacher/20-teaching.md:5-22`).
- Runs a predict, teach, check cycle (`teacher/28-predictions.md:3-20`).
- Checks should "Prefer problems that apply the knowledge", and each wrong option should name a specific wrong model (`teacher/30-question-principles.md:9-10`).

**Question data.** Multiple-choice `quiz` carries `confidence` (0–100) and `explain` is free recall (`src/core/question-core.ts:470`; `src/agent/tools.ts:145-260`). There are two thinking channels: `thinking` and `thinkingWhileReading` (`src/core/question-core.ts:456-466,836-843`). Confidence is read "not as proof of understanding" (`src/agent/prompts/shared/25-confidence.md:3`).

**Practice.** Its theory rests on the "inactivity constraint" and on decision points (`practice/10-doctrine.md:17,31-37`).
- Three modes: recall, discrimination and composition (`:43-57`).
- Demand templates: reverse, discriminate and probe-the-premises (`:57`).
- An 85% success band per retrieval event (`:39`), with interleaving as the default (`:35,70`).
- A hint ladder from R0 to R5 (`:89-106`), miss classification (`:116`), and retests of every miss before the session ends (`:128`).
- It accepts outside problems such as exam problems (`:130`).
- `conclude` records `outcome`, `verdict`, `rung`, `missClass` and `retest` (`src/agent/tools/practice.ts:136-165`).
- Practice outcomes "are session evidence, not graph mastery", and practice skips extraction (`docs/architecture.md:82`).

**Graph and chains.** The graph stores "objective propositions and jointly-entailing reasoning chains, not learner understanding levels" (`docs/architecture.md:112`). It contains "no quiz outcomes, no understanding assessments" (`src/core/contracts/graph.ts:9-10`). Provenance is per (chatId, messageId) (`graph.ts:68-74,133`). Extraction reads teacher prose only (`docs/architecture.md:123`). The teacher has no graph reader (`:143`).

**Coding Questions core plugin.**
- Adds `coding_question` to the teacher and `coding_problem` to practice (`plugins/coding-questions/README.md:49-50,186-203`).
- The agent writes the tests and runs them locally against `answer.txt`, with a 30 s deadline and no sandbox (`:9-12,76-87`).
- Results are `passed | failed | error` with stdout and stderr, and "no score" (`:117-136`).
- Only `conclude` closes a practice problem (`:221-222`).
- The prober receives no coding tool (`:49`).

**Side questions.** These are tool-less helper calls on the session's model (`docs/architecture.md:62`). Their exchanges are appended to teacher and practice context as reference, but they "a helper's explanation alone does not establish that the learner understood it" (`src/agent/prompts/shared/35-side-conversations.md:3`), and extraction ignores them (`docs/architecture.md:64`).

**Research and PDF jobs.** These are fire-and-forget background workers (`docs/architecture.md:88`). The teacher's `research` is for verification, "Never for internal reasoning or math" (`teacher/40-jobs.md:3`). A `pdf` job returns "a brief with page citations" (`:16`).

**Demos and visuals.**
- `demo` builds single-file interactive HTML and tests it headlessly (`teacher/50-demos.md:7`).
- `visual` draws SVG through a render-and-inspect loop and can annotate a figure on a PDF page (`:11`; `teacher/55-images.md:7`).
- Drawing Pad attaches ink to submissions (`plugins/drawing-pad/README.md:18-21`).
- Flashcards generates recall cues from the graph and reviews them with FSRS-6 (`plugins/flashcards/README.md:3,87`).

**Session kinds (upstream `feature/session-kinds`, not on `upstream/main`).** `git grep registerSessionKind upstream/main` returns nothing.
- `ctx.registerSessionKind` and `ctx.registerRecordKind` (`upstream/feature/session-kinds:docs/plugin-authoring.md:567-572`).
- A kind is "teaching-shaped: a prober phase that ends with `probe_done`, then a teacher phase" (`:574`). Per-phase prompts are either a replacement string or an ordered list of plugin text and host segments (`:577-583`).
- Tool deltas can remove native tools, but "`probe_done` and `plan_init` are always kept" (`:589-591`).
- `record` names `"graph"` or a plugin record kind (`:593`). Each kind gets a sidebar door and a filter (`:598-600`).
- A record kind's `extract(batch)` receives raw saved messages "unfiltered: learner turns, assistant text, thinking and tool calls, tool results" (`:603-607`). This differs from the native graph, which reads teacher prose only.
- Record views mount on home (`:638-646`).
- The local `exp/session-kinds` branch already prototypes `harness:material` (commit `3b1989c7`).
- Managed agents (`ctx.agents`) give a plugin its own conversation with `kind: "input"` tools, outside the session-kind shape (`upstream/feature/session-kinds:docs/plugin-authoring.md:700-719`; the same section is on main at `docs/plugin-authoring.md:605`).

What session kinds would enable:
- A **paper-discussion** kind: the prober probes the paper's prerequisites, and a replaced teacher prompt questions the learner about the paper's claims, ablations and failure modes. It would record into a plugin "interview performance" record that can read thinking and answers.
- A **system-design** kind: the teacher prompt poses a design brief, and the answer goes through Drawing Pad or free text.
- A **mock coding interview** does not fit, because kinds are teaching-shaped. Practice (`problem`/`conclude`, the hint ladder) is the closer shape, and session kinds cannot select it.

### Implications for the product

- Concept depth is covered well. The probe brackets a floor and ceiling, teaching runs a predict and check per step, and practice trains retrieval, discrimination and composition with honest verdicts. Coding practice with tests already exists, and outside problems are accepted, so an interview problem can be practiced today.
- The loop has no notion of a role, an interview stage, a time limit or an unassisted condition. Everything learner-facing records into either the objective graph or transcripts.
- Session kinds are the intended seam for interview-style sessions, but they are unreleased and teaching-shaped. A practice-shaped or interview-shaped kind needs either an upstream change or a managed agent the fork owns.

---

## 3. alphaXiv MCP

Source: https://alphaxiv.org/docs/mcp.
- Endpoint `https://api.alphaxiv.org/mcp/v1`, Streamable HTTP without sessions, MCP revision 2025-11-25.
- Auth is OAuth 2.1, or an API key sent as `Authorization: Bearer <key>`.
- Browser cross-origin calls are rejected.
- Each tool is labelled Read, Writes or Destructive.

**Going deep on one paper:**
- `get_paper_content(url, fullText?)`: "a structured AI-generated intermediate report", or raw text when `fullText` is set.
- `answer_pdf_queries(paper, queries[])`: "the filtered page-level content of a single PDF". The docs say to "batch every question you have for that paper into one call".
- `read_files_from_github_repository(githubUrl, path)`: reads the default branch, limited to "150 calls an hour per account".
- `get_paper_notes`: the user's own highlights and notes (Read).

**Finding what to study:**
- `discover_papers(keywords[], question, difficulty 1–10, published_after?, published_before?, prioritize?)` runs "an agentic retrieval loop that combines keyword search, embedding search". It uses assistant quota. What `difficulty` means is unconfirmed.
- `get_hot_feed` and `get_for_you_feed` (limit up to 200) make "no model calls". They "never touch your assistant quota".
- `find_researchers` matches topics "from the authorship graph" and can filter by affiliation. `get_researcher_papers` sorts by recent, cited or viewed. `resolve_researchers` maps names to alphaXiv researcher entries. These tools stop working once assistant quota runs out.
- `save_papers_to_folder` and `create_folder` (Writes) build reading lists.
- No dedicated "similar papers" tool is documented (unconfirmed).

Whether `get_paper_content` and `answer_pdf_queries` use quota is unconfirmed.

### Implications for the product

- The four read-only tools in the product brief (`docs/product-brief.md`, Features) cover going deep on one paper.
- For "what to study for this role" the brief leaves out the most useful tools: `find_researchers` with `affiliation`, plus `get_researcher_papers`, give what a target lab's people are publishing now. `get_hot_feed` is free. All of these are labelled Read, so adding them keeps the brief's read-only rule.
- Quota behaviour differs per tool, so discovery runs should prefer the feeds and the researcher tools over repeated `discover_papers` calls.

---

## 4. Learning science for going deep

Ratings marked "confirmed" were read from a fetched abstract or PDF. Ratings marked "unconfirmed text" rest on citation metadata only.

| Technique | Primary sources | What it says about deep understanding versus recall | Boundary conditions |
|---|---|---|---|
| Retrieval practice | Roediger & Karpicke 2006, doi:10.1111/j.1467-9280.2006.01693.x. Karpicke & Blunt 2011, doi:10.1126/science.1199327. Butler 2010, doi:10.1037/a0019902. Pan & Rickard 2018, doi:10.1037/bul0000151. | R&K 2006 measured free recall only; restudy "increased students' confidence". K&B 2011: the gain held "with test questions that assessed comprehension and required students to make inferences". Butler 2010: transfer to "new inferential questions from different knowledge domains". Pan & Rickard: transfer d = 0.40, strongest "to application and inference questions". | The benefit appears at a delay. After bias correction, Pan & Rickard find "often… no positive transfer" unless the retrieval is elaborated or response-congruent. |
| Self-explanation and elaborative interrogation | Chi et al. 1989, doi:10.1207/s15516709cog1302_1. Chi et al. 1994, doi:10.1207/s15516709cog1803_3. Bisra et al. 2018, doi:10.1007/s10648-018-9434-x. Dunlosky et al. 2013, doi:10.1177/1529100612453266. Pressley et al. 1987, doi:10.1037/0278-7393.13.2.291 (unconfirmed text). | Chi 1989: good students relate steps "to principles", building "example-independent knowledge", and they monitor accurately; this is correlational. Chi 1994: prompting improved the "correct mental model". Bisra: g = .55. Dunlosky: both techniques rated moderate utility. Pressley 1987 is about recall of facts (unconfirmed text). | Benefit depends on the quality of the explanations, not on the prompt alone. Elaborative interrogation needs prior knowledge (unconfirmed text). |
| Worked examples | Sweller & Cooper 1985, doi:10.1207/s1532690xci0201_3. Sweller 1988, doi:10.1207/s15516709cog1202_4. Atkinson et al. 2000, doi:10.3102/00346543070002181. Renkl & Atkinson 2003, doi:10.1207/S15326985EP3801_3. | S&C 1985: the gains "were specific to problems identical in structure"; abstraction "may occur only with considerable practice". Atkinson 2000: label the structure, use several examples per type, and prompt self-explanation. | Worked examples suit early skill. "In later stages… solving problems is superior" (R&A 2003). |
| Interleaving | Rohrer & Taylor 2007, doi:10.1007/s11251-007-9015-8. Kornell & Bjork 2008, doi:10.1111/j.1467-9280.2008.02127.x. Rohrer, Dedrick & Stershic 2015, doi:10.1037/edu0000001. Brunmair & Richter 2019, doi:10.1037/bul0000209. | Trains discrimination: "choose a strategy on the basis of the problem itself" (Rohrer 2015). R&T 2007: "superior test performance and inferior practice performance", with blocked 20% vs mixed 63% at one week. | Brunmair & Richter: overall g = 0.42, math g = 0.34, expository text not significant, words g = −0.39. It helps most when categories are similar to each other. |
| Desirable difficulties, generation, productive failure, pretesting | Bjork & Bjork 2011 (chapter PDF). Bjork 1994 (unconfirmed text). Slamecka & Graf 1978, doi:10.1037/0278-7393.4.6.592. Kapur 2008, doi:10.1080/07370000802212669. Kapur 2014, doi:10.1111/cogs.12107. Sinha & Kapur 2021, doi:10.3102/00346543211019105. Richland, Kornell & Kao 2009, doi:10.1037/a0016496. | Bjork & Bjork: rereading gives "perceptual fluency that we interpret as understanding". Kapur 2014: both conditions reached procedural knowledge, but solving first gave "significantly greater conceptual understanding and ability to transfer". Sinha & Kapur: g = 0.36. Richland 2009: failed pretests still helped. The generation effect is recall-only. | Difficulties are desirable only if the learner can respond successfully; otherwise they "become undesirable difficulties". Productive failure includes instruction afterwards. |
| Deliberate practice | Ericsson, Krampe & Tesch-Römer 1993, doi:10.1037/0033-295X.100.3.363. Macnamara, Hambrick & Oswald 2014, doi:10.1177/0956797614535810. | Ericsson: elite differences are "closely related to assessed amounts of deliberate practice". Macnamara: it explains "4% for education, and less than 1% for professions". | Both measure performance, not understanding. |
| Expertise reversal | Kalyuga et al. 2003, doi:10.1207/S15326985EP3801_4. Kalyuga 2007, doi:10.1007/s10648-007-9054-3. | Support "highly effective with inexperienced learners can lose their effectiveness and even have negative consequences" as expertise grows. | Instruction has to adapt to measured prior knowledge. |
| Illusion of understanding | Rozenblit & Keil 2002, doi:10.1207/s15516709cog2605_1. Koriat & Bjork 2005, doi:10.1037/0278-7393.31.2.187. Bjork, Dunlosky & Kornell 2013, doi:10.1146/annurev-psych-113011-143823. Fernbach et al. 2013, doi:10.1177/0956797612464058. Dunlosky & Rawson 2012, doi:10.1016/j.learninstruc.2011.08.003 (unconfirmed text). Chi & Wylie 2014 (ICAP), doi:10.1080/00461520.2014.965823. | R&K: the illusion is "far stronger for explanatory knowledge", and "most robust where the environment supports real-time explanations with visible mechanisms". Koriat & Bjork: judgments made while the answer is present "instill a sense of competence… unwarranted during testing". Kornell & Bjork 2008: learners rated massing better "even after their own test performance had demonstrated the opposite". Fernbach: asking for a "mechanistic explanation" punctured the illusion; listing reasons did not. ICAP: interactive > constructive > active > passive. | Feelings of understanding are miscalibrated, and most of all for explanations. |

**Where the method aligns:**
- *Practice doctrine.* It encodes the retrieval, delay and interleaving findings: "the proposition you are exercising is inactive" (`practice/10-doctrine.md:17`), "Re-asking immediately after feedback is weak practice" (`:34`), and interleaving by default (`:35`, matching Rohrer). Its reverse and probe-the-premises templates (`:57`) are elaborated retrieval, the moderator Pan & Rickard require for transfer.
- *Check craft.* "Prefer problems that apply the knowledge" (`teacher/30-question-principles.md:9`) matches the inference and transfer finding.
- *Thinking fields.* They are prompted self-explanation, and the system reads them as primary data (`shared/16-mental-model.md:3-5`), which fits Chi 1994 and Fernbach 2013.
- *Predictions.* Prediction before teaching (`teacher/28-predictions.md:7-9`) is a pretest and generation move (Richland 2009; Kapur).
- *Expertise reversal.* Choosing Socratic or expository per step and probing for a floor and ceiling (`teacher/20-teaching.md:16-22`; `prober/10-probe-doctrine.md:25`) is the adaptation Kalyuga calls for.
- *Spacing.* FSRS flashcards add spacing for recall cues.

**Where it conflicts or is complicated:**
- **"Understanding = the goal feels obviously true"** (`docs/teaching-methodology.md:16`) is a claim about a feeling, and the fluency literature says that feeling is weakest exactly where the method works: explanatory knowledge with visible mechanisms, which is what demos and step-by-step derivation produce (Rozenblit & Keil; Bjork & Bjork; Koriat & Bjork). The implementation partly protects against this:
  - A graded check follows every step (`teaching-methodology.md:82-86`).
  - Confidence is not treated as proof (`shared/25-confidence.md:3`).
  - The voice rules ban agreement bias (`shared/10-voice.md:6`).

  Those checks are still **immediate**, and the methodology admits that: "the check measures comprehension of the active" (`practice/10-doctrine.md:17`). No delayed, cold, transfer check gates the terminal condition. A defensible reading of the evidence: the feeling counts only when it survives a delayed retrieval or transfer demand, which today happens only if the learner opens a practice session.
- **Retention claim.** "Memorized facts rot. Understood facts don't" (`src/agent/system-prompt.md:5`) is not tested in these sources. The retention evidence here comes from retrieval and spacing, not from self-evidence. Treat it as an untested owner hypothesis.
- **Practice band.** The 85% band (`practice/10-doctrine.md:39`) cites no source. Its origin is unconfirmed.
- **Volume.** Macnamara 2014 is a caution against any "hours practiced means mastery" metric.

### Implications for the product

- For role prep, the evidence favours delayed, unassisted demands that require inference or transfer over immediate checks. Practice already does this within a session. The gap is across sessions: nothing schedules a cold retest of understood material, and nothing gates the ledger's Understand stage on one.
- Interview formats are themselves retrieval under transfer. Explaining your own work or defending a design is the mechanistic-explanation demand Fernbach found calibrates the feeling, so mock sessions double as calibration.
- Do not market "feels obviously true" as the proof of understanding. Pair it with a demonstrated delayed transfer.

---

## 5. Personalization signals

**Recorded by the core loop:**
- `ChatRecord` (`src/core/contracts/chat.ts:24-49`, stored at `data/chats/*.json` per `docs/architecture.md:153`): native messages, `kind`, the plan tree, per-turn usage, extraction usage, model and thinking settings, and `sideChats`.
- Per answer, `QuestionAnswerData` (`src/core/question-core.ts:438-477`): `questionType` (predict/check), `answers`, `text`, `thinking`, `readingThinking`, `confidence` (quiz only), `correct`, `dontKnow`, `dismissed`, `images`, `answeredAt`.
- The probe assessment: strands with a floor, a ceiling and misconceptions (`src/core/contracts/probe.ts:44-69`).
- Per practice problem: `outcome`, `verdict`, `rung`, `missClass`, `retest` (`src/agent/tools/practice.ts:136-165`), plus coding test results and the exact submitted code (`plugins/coding-questions/README.md:211-216`).
- The graph: propositions and chains with (chatId, messageId) provenance and birth-session clusters (`src/core/contracts/graph.ts:68-74,113-134,315-319`).
- Flashcards: FSRS self-ratings and schedule state per proposition (`plugins/flashcards/README.md:55-57,87`).
- The compaction summary carries "quiz outcomes, confidence… misconceptions" within one session (`src/core/compaction.ts:411`).

**Added by the gen-media ledger and Evidence files:**
- `Entry` (paper, framework or own work, with lineage and source).
- `SessionLinked`.
- `MarkedUnderstood {chatIds, chainIds}`, which requires at least one chain but no test (`plugins/harness/src/domain.ts:52,208-211`).
- `EvidenceAccepted` and `EvidenceRejected`.
- `HandoffWritten` (`domain.ts:48-57`).
- Evidence adds per-stage proof: tests passed of total, baseline against result with `why`, and serve latency, throughput and cost. It also adds `gap {concept, why}` on a failure that traces back to understanding (`gen-media/contracts/evidence/README.md:23-51`). This is the only signal anywhere that links a production failure back to a concept.

**Not recorded:**
- Any learner model across sessions. The graph excludes outcomes by design (`graph.ts:9-10`), and practice outcomes are "not graph mastery" (`docs/architecture.md:82`).
- A target role, its capability list, or interview dates.
- Confidence on free recall, `explain` or practice problems (confidence is quiz-only, `src/core/plugin-submissions.ts:175`).
- Time to answer. Only `answeredAt` exists; whether pose time is recorded is unconfirmed.
- Calibration over time: confidence against correctness is stored per answer but never aggregated.
- Delayed retests across sessions, except FSRS cue ratings.
- Spoken-explanation quality, communication, and design trade-off reasoning as named dimensions.
- Side questions as evidence: they are context only and excluded from extraction (`shared/35-side-conversations.md:3`; `docs/architecture.md:64`).

### Implications for the product

- The raw material for a per-learner capability model already exists: thinking text, verdicts, miss classes, hint rungs, confidence against correctness, test results and Evidence gaps. It is spread across chat files and nothing aggregates it.
- Every signal is the learner's own, recorded locally, so using it for personalization is legitimate.
- The aggregation has to be fork-owned or come through a record kind, because upstream keeps the graph free of learner state on purpose.

---

## 6. Gaps and seams

| Needed capability | Smallest seam | Touches the upstream core loop? |
|---|---|---|
| Role profile: postings mapped to capability claims, each with URL and fetch date | Fork-owned feature and storage (a new Harness domain type next to `Entry`) | No |
| Map role capabilities to Material and graph clusters | Harness domain: link capability to Entry. Read the graph through plugin read-only learning records (`docs/architecture.md:192`) | No |
| Discover what to study for a role or lab | MCP client tools (product brief) and the alphaXiv read tools `find_researchers`, `get_researcher_papers`, `get_hot_feed`, delivered as plugin tools | No; it uses the plugin tool path |
| Paper-discussion session (defend claims, ablations, failure modes) | Session kind with a replaced teacher prompt and a record kind (`upstream/feature/session-kinds:docs/plugin-authoring.md:574-593`) | No edit, but it depends on unreleased upstream API (ADR 0003 rule; ADR 0004 allows narrow PRs) |
| ML system-design session (inference, training parallelism) | Same session kind seam. Answers through Drawing Pad or free text. Optionally a plugin question type for a structured design rubric (`registerQuestionType`) | No edit; same dependency |
| Unassisted, timed mock coding interview | Practice-shaped session kind (not supported: kinds are teaching-shaped, `:574`), or a fork-owned managed agent with `kind: "input"` tools (`:700-719`) reusing `coding_problem`'s runner. The hint ladder and side questions must be off. Whether a kind can disable side questions is unconfirmed. | Kind route: an upstream PR to extend session-kind shapes. Managed-agent route: no |
| Experience deep-dive (STAR, "discuss your work") | Session kind prompt over Own work Entries (vault notes) | No edit; same dependency |
| Cold delayed transfer test before Understand passes | Harness domain rule: require a practice outcome from a linked session at least N days after the teach session, beside `markUnderstood` (`plugins/harness/src/domain.ts:208-211`). Scheduling lives in Today | No |
| Cross-session capability and calibration model | Record kind whose `extract` reads raw turns, including tool results and thinking (`upstream/feature/session-kinds:docs/plugin-authoring.md:603-607`). Before session kinds land, a fork-owned reader over `data/chats/*.json` | No (record kind) / No (fork reader) |
| Confidence on free recall and practice | Change `confidence` admission in question-core and plugin-submissions (`src/core/plugin-submissions.ts:175`) | Yes: a core contract change, PR upstream |
| Answer latency | Record pose time beside `answeredAt` (`src/core/question-core.ts:476`) | Yes: small core contract change, PR upstream |
| Role-aware probing (prober knows the target role) | A per-turn plugin instruction contribution (`docs/architecture.md:192`) carrying the role profile, without editing `prober/` fragments | No |
| Interview-relevant coding (PyTorch, CUDA) | Coding Questions as is: it runs any installed runtime and exits nonzero on failure (`plugins/coding-questions/README.md:35-40`). The 30 s deadline (`:84`) is too short for GPU work, so GPU checks go through Run Desk Evidence | No |

### Implications for the product

- Most gaps are fork-owned or come through plugin seams already on main: per-turn instructions, plugin tools, question and problem types, read-only learning records, and managed agents.
- Two needs touch the core contract: confidence outside multiple choice, and answer latency. Both are small additive fields and fit the "narrowest seam, PR upstream" rule in ADR 0004.
- Paper-discussion, system-design and experience sessions all hinge on `feature/session-kinds` reaching `upstream/main`. A mock coding interview needs either a practice-shaped kind upstream or a fork-owned managed agent. The managed agent is the only route that depends on nothing unreleased.
