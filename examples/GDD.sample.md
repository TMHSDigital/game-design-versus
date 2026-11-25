# Steel and Momentum

> The player fights in order to reach their goals, with melee-focused combat range.

Steel and Momentum is an action and fighting game. Think Celeste meets Outer Wilds. Original pitch: A physics-driven medieval sword fighter where momentum, edge contact and armor decide every hit. Its pillars: Camera view: Over-shoulder third person; Combat range: Melee-focused; Failure penalty: None (instant retry).

Overall clarity 0.8 after 32 questions.

## 1. Frame

| Aspect | Decision |
| --- | --- |
| Target platforms | PC |
| Primary input | Flexible (no strong preference) |
| Player count | Local versus |
| Session length | Short sessions |
| Product length | Flexible (no strong preference) |
| Business model | Flexible (no strong preference) |
| Team size | 2 to 5 |
| Timeline | 1 to 2 years |
| Engine | Undecided |
| Audience rating | Mature |
| Dimensionality | 3D |
| Realism | Grounded simulation |

## 2. Experience targets

- MDA aesthetics: Sensation, Challenge, Expression
- Player motivations: Undecided
- Tone: Leans Grim
- Pace: Intense
- Challenge: Punishing

## 3. Genre

- Families: Action, Fighting
- Forms: None
- Tags: Action, Fighting, Over-shoulder third person, 3D, Local versus
- Closest archetypes: Physics brawler (100%), Fighting game (0%), Platform fighter (0%)

## 4. Design pillars

1. **Camera view: Over-shoulder third person**. Camera behind and beside the character
2. **Combat range: Melee-focused**. Like Chivalry 2 (A first-person slasher: clashing swords and deep melee combat on foot or horseback decide most fights, with archers as a side class), not Battlefield 1.
3. **Failure penalty: None (instant retry)**. Like Celeste (Death returns Madeline to the start of the screen instantly with infinite lives; the only cost is a few seconds.), not Dark Souls or XCOM 2.
4. **Run structure: Run-based**. Like Risk of Rain 2 (Items stack within a run and are lost on death; only unlocks carry over.), not Borderlands 2.
5. **World structure: Single arena**. Like Rocket League (Every ranked match is played in a standard arena with identical dimensions and boost pads; only the cosmetics of the stadium change.), not Forza Horizon 4 or Mario Kart 8 Deluxe.

## 5. Core loop

- Seconds: the player fights under constant pressure, reading the situation and executing in the moment; combat is physics-simulated.
- Minutes: a session of under 20 minutes is one or more runs that reset on failure, toward goals the player sets.
- Weeks: mastery and variety keep the player returning.

## 6. Systems spec

### Camera and controls (clarity 0.82)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Camera view | Over-shoulder third person | decided |  |
| Camera control | Leans Player-controlled (lean 26) | inferred |  |
| Control complexity | Leans Few inputs (lean 26) | inferred |  |
| Input physicality | Physics-driven input (lean 3) | inferred |  |

### Core loop (clarity 0.84)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Core verbs | Fight | decided |  |
| Decision cadence | Moment-to-moment execution (lean 3) | inferred |  |
| Goal source | Leans Self-directed goals (lean 74) | inferred |  |
| Run structure | Run-based (lean 81) | decided | like Risk of Rain 2 (Items stack within a run and are lost on death; only unlocks carry over.), not Borderlands 2 |
| Time model | Real-time (lean 20) | decided | like Command & Conquer (Units and enemy production keep moving while the player issues orders.), not X-COM: UFO Defense |

### Combat (clarity 0.78)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Combat centrality | Core pillar (lean 97) | inferred |  |
| Combat time model | Real-time | decided |  |
| Combat simulation | Physics-simulated (lean 3) | inferred |  |
| Combat range | Melee-focused (lean 20) | decided | like Chivalry 2 (A first-person slasher: clashing swords and deep melee combat on foot or horseback decide most fights, with archers as a side class), not Battlefield 1 |
| Targeting | Free aim or free swing (lean 97) | inferred |  |
| Attack input | Directional or stance input (lean 3) | inferred |  |
| Combat resource | Flexible (no strong preference) (lean 50) | flexible |  |
| Primary defense | Flexible (no strong preference) | flexible |  |
| Animation commitment | Leans Committed animations (lean 26) | inferred |  |
| Time to kill | Leans Lethal short TTK (lean 26) | inferred |  |
| Number display | Hidden math (lean 3) | inferred |  |
| Enemy count | Duels (lean 3) | inferred |  |
| Enemy AI | Blend of Patterned enemies and Systemic planning AI (lean 50) | inferred |  |
| Units controlled | Single character (lean 3) | inferred |  |
| Combat information | Blend of Perfect information and Hidden rolls or fog (lean 50) | inferred |  |
| Violence depiction | Visceral (lean 97) | inferred |  |

### Movement (clarity 0.77)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Movement feel | Weighty and grounded (lean 3) | inferred |  |
| Movement precision | Leans Forgiving (lean 26) | inferred |  |
| Traversal tools | On foot only (lean 3) | inferred |  |
| Climbing | Authored paths (lean 3) | inferred |  |

### World (clarity 0.62)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| World structure | Single arena | decided | like Rocket League (Every ranked match is played in a standard arena with identical dimensions and boost pads; only the cosmetics of the stadium change.), not Forza Horizon 4 or Mario Kart 8 Deluxe |
| World authoring | Leans Handcrafted (lean 26) | inferred |  |
| World size | Compact and dense (lean 3) | inferred |  |
| World persistence | Resets (lean 3) | inferred |  |
| Destruction | Leans Fully destructible (lean 74) | inferred |  |

### Failure and difficulty (clarity 0.82)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Failure penalty | None (instant retry) | decided | like Celeste (Death returns Madeline to the start of the screen instantly with infinite lives; the only cost is a few seconds.), not Dark Souls or XCOM 2 |
| Saving | Flexible (no strong preference) | flexible |  |
| Difficulty options | Leans One tuned difficulty (lean 26) | inferred |  |
| Dynamic difficulty | Leans Static (lean 26) | inferred |  |

### Multiplayer (clarity 0.91)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Multiplayer mode | Flexible (no strong preference) (lean 50) | flexible |  |
| Match size | Flexible (no strong preference) (lean 50) | flexible |  |
| Multiplayer structure | Flexible (no strong preference) (lean 50) | flexible |  |
| Matching | Flexible (no strong preference) (lean 50) | flexible |  |
| Loss on death | Flexible (no strong preference) (lean 50) | flexible |  |
| Asynchronous play | Leans None (lean 26) | inferred |  |
| Role symmetry | Flexible (no strong preference) (lean 50) | flexible |  |
| Communication | Blend of Voice-reliant and Ping and contextual comms (lean 50) | inferred |  |

### Presentation (clarity 0.72)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Art style | Blend of Realistic and Stylized (lean 50) | inferred |  |
| Fidelity | Blend of Pixel or low-poly and High fidelity (lean 50) | inferred |  |
| Palette | Leans Muted (lean 26) | inferred |  |
| UI diegesis | Leans Diegetic UI (lean 26) | inferred |  |
| System transparency | Hidden systems (lean 3) | inferred |  |
| Music | Leans Adaptive score (lean 74) | inferred |  |
| Music sync | Independent (lean 3) | inferred |  |

### Meta (clarity 0.74)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Live model | Finished product (lean 3) | inferred |  |
| Mod support | Leans Closed (lean 26) | inferred |  |
| Replay source | Systems-driven (lean 97) | inferred |  |

### Fighting (clarity 1)

| Axis | Position | Status | Reference |
| --- | --- | --- | --- |
| Fighting input | Flexible (no strong preference) (lean 50) | flexible |  |
| Win condition | Flexible (no strong preference) (lean 50) | flexible |  |

## 7. Comparable titles

**Celeste meets Outer Wilds**

- **Celeste**: borrow failure penalty: Death returns Madeline to the start of the screen instantly with infinite lives; the only cost is a few seconds.
- **Outer Wilds**: borrow dimensionality: A fully 3D solar system whose planets are packed with hidden locations to reach and explore.
- **Rocket League**: borrow world structure: Every ranked match is played in a standard arena with identical dimensions and boost pads; only the cosmetics of the stadium change.
- **Animal Crossing**: borrow embodiment: The player walks one villager around town to talk to neighbors and fish.
- **Arma 3**: borrow realism: A massive military sandbox sold on authentic, true combat gameplay across infantry and vehicle warfare.

## 8. USPs and non-goals

**USPs**

- Camera view: Over-shoulder third person

**Non-goals**

- No strategy module
- No puzzle module
- No racing module
- No sports module
- No horror module
- No card module
- No idle module
- No party module
- No rhythm module
- Not stylized arcade (realism)
- Not persistent campaign (run structure)
- Not turn-based (time model)

## 9. Scope

- Team: 2 to 5
- Timeline: 1 to 2 years
- Active modules: 18
- MVP: All active systems at minimal depth plus one region or mode of content.
- Vertical slice: A 30 to 60 minute slice at shipping quality that shows every pillar.

## 10. Risks

- **warn**: Scope: 18 active modules for a team of 2 to 5 on a timeline of 1 to 2 years. Cut to the pillars (Camera view, Combat range, Failure penalty) for the MVP.

## 11. Open questions

- (2) Setting: which fits your game? (clarity 0)
- (2) Player motivations: Which player motivations should the game serve most? (clarity 0.27)
- (1) Engine: which fits your game? (clarity 0)
- (1) World time: which fits your game? (clarity 0)

## 12. Decision log

| When | Kind | Axis | Answer |
| --- | --- | --- | --- |
| 2026-11-23T00:00:00.000Z | set | frame.platform | ["pc"] (confidence 0.9) |
| 2026-11-23T00:00:00.000Z | set | frame.players | "local_versus" (confidence 0.9) |
| 2026-11-23T00:00:00.000Z | set | genre.family | ["action","fighting"] (confidence 0.9) |
| 2026-11-23T00:00:00.000Z | answer | systems.checklist | none of these |
| 2026-11-23T00:00:00.000Z | answer | genre.form | no_pref |
| 2026-11-23T00:00:00.000Z | answer | frame.team | 2 to 5 |
| 2026-11-23T00:00:00.000Z | answer | frame.timeline | 1 to 2 years |
| 2026-11-23T00:00:00.000Z | answer | cam.view | Over-shoulder third person |
| 2026-11-23T00:00:00.000Z | answer | frame.dimension | Outer Wilds |
| 2026-11-23T00:00:00.000Z | answer | systems.checklist | none of these |
| 2026-11-23T00:00:00.000Z | answer | frame.monetization | no_pref |
| 2026-11-23T00:00:00.000Z | answer | combat.range | Chivalry 2 |
| 2026-11-23T00:00:00.000Z | answer | move.vehicles | No vehicles |
| 2026-11-23T00:00:00.000Z | answer | ctl.embodiment | Animal Crossing |
| 2026-11-23T00:00:00.000Z | answer | frame.realism | Arma 3 |
| 2026-11-23T00:00:00.000Z | answer | fail.penalty | Celeste |
| 2026-11-23T00:00:00.000Z | answer | loop.run | Risk of Rain 2 |
| 2026-11-23T00:00:00.000Z | answer | loop.time | Command & Conquer |
| 2026-11-23T00:00:00.000Z | answer | combat.time_model | Real-time |
| 2026-11-23T00:00:00.000Z | answer | world.structure | Rocket League |
| 2026-11-23T00:00:00.000Z | answer | mp.mode | no_pref |
| 2026-11-23T00:00:00.000Z | answer | mp.structure | no_pref |
| 2026-11-23T00:00:00.000Z | answer | fight.win | no_pref |
| 2026-11-23T00:00:00.000Z | answer | exp.aesthetics | selected: Sensation, Challenge, Expression |
| 2026-11-23T00:00:00.000Z | answer | loop.verb | selected: Fight |
| 2026-11-23T00:00:00.000Z | answer | mp.size | no_pref |
| 2026-11-23T00:00:00.000Z | answer | frame.input | no_pref |
| 2026-11-23T00:00:00.000Z | answer | combat.defense | no_pref |
| 2026-11-23T00:00:00.000Z | answer | fail.save | no_pref |
| 2026-11-23T00:00:00.000Z | answer | fight.input | no_pref |
| 2026-11-23T00:00:00.000Z | answer | frame.length | no_pref |
| 2026-11-23T00:00:00.000Z | answer | mp.symmetry | no_pref |
| 2026-11-23T00:00:00.000Z | answer | mp.matching | no_pref |
| 2026-11-23T00:00:00.000Z | answer | mp.loss | no_pref |
| 2026-11-23T00:00:00.000Z | answer | combat.resource | no_pref |
