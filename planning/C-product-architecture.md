# Deliverable C. Product architecture

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Fable proposal **[F]** throughout. Names are working names; user-facing vocabulary is Cory's (D5). Not implementation authority.

The previous version prescribed eleven domain modules with entities, ownership lines, an import diagram and a shared kernel of product types. Much of that structure had no current requirement, and its diagram made the working-state module and the evidence module depend on each other. This version keeps the boundaries that are worth holding now, states one dependency rule, and leaves the rest as direction until a stage needs it.

## 1. What is firm and what is not

**Firm, because a ratified outcome requires it [R]:**

- **Working state and evidence are different things with different lifetimes.** What is being arranged can change; what was presented and affirmed cannot (I1, I2).
- **Nobody is listed or browsable** (I6).
- **Each party is delivered an artifact they hold independently** (I13).

**Engineering positions [F], held because the prototype's failures argue for them:**

- **Who is acting is established in one place** and checked on every operation. The doctrine line behind this is provisional (I3); it is adopted here as an engineering standard and is Dustin's.
- **A party's continued access to their evidence is not handled by the mechanism used for sharing personal material.** One user's sharing controls should not be able to remove another party's access to an agreement they were part of. What does end or limit that access (suspension, closure, removal, retention) is open (D9).

**Proposed, and open to change when requirements arrive:** every module name, every boundary between later areas, and where code lives.

**Not decided here:** anything about what a collaboration, an agreement, a participant or an organizer is. Those concepts are in Deliverable E and wait on Deliverable H.

## 2. Responsibility areas for the first slice

Four areas. They are responsibilities, not packages; how they map to code is decided in the Stage 1 PRDs.

| Area | Responsible for | Not responsible for |
|---|---|---|
| **Access** | Establishing who or what is acting on each request, and enforcing the policy every operation declares. In Stage 1: whatever sign-in and invitation credentials D3 calls for. | Deciding what a credential proves about a person (D3, D12). Professional identity. Suspension policy (D9). |
| **Collaboration (working state)** | The plan as it is being arranged: parties, obligations, draft terms, invitations and where each stands. | Anything that has been presented. Once terms are put in front of someone, the copy they saw belongs to evidence. |
| **Agreement evidence** | What each party was shown, what each responded and affirmed, what made the agreement final, and the artifacts delivered. Integrity checks. | Editing. It has no edit path. |
| **Notifications** | Messages the product sends, with delivery state, so a safety-relevant message that fails is visible as a failure. | Any channel between users. Cory's July model **[CA]** has no unstructured channel (CORY-QUESTIONS:157). |

**One dependency rule.** Evidence depends on nothing mutable. Working state may read evidence (to know what is agreed); evidence never reads working state after the moment of presentation. The shape of presented terms is defined on the evidence side, because that is the side that must never change. This removes the cycle in the previous diagram, where the collaboration module called evidence to present and evidence depended on the collaboration module's terms shape.

**Organizer.** Not an area and not a kind of party. Coordination (creating, editing, inviting, presenting) is a set of permissions on working state. Obligations (paying, delivering, granting rights) belong to whichever parties undertake them. See Deliverable E, section 2.

**Profiles.** The previous version put a minimal professional profile in the first slice. Nothing in the ratified evidence set needs one: a party must be named in an agreement, and a name does that. Profiles arrive with professional identity in a later stage unless Cory's scenario (D1) shows the first collaboration needs one.

## 3. Later areas: direction only

Each is designed when its stage begins and its decisions are answered. Nothing is reserved for them in advance.

| Area | Direction | Open before it can be designed |
|---|---|---|
| **Documents** | Standard documents (releases, usage licence) assembled and signed, free | Which documents (D8). Whether a document can be produced outside a collaboration for work with someone not on the app: VISION:469 **[R]** requires free documents including with non-users, and Cory's July concept **[CA]** has them usable outside the app entirely. The previous version assembled documents only from an agreed collaboration; that would make free documents depend on initiating one (D7). |
| **Professional identity** | How a person presents themselves: profile, later role-specific content | Role contents; representation (D12) |
| **Presence and sharing** | Comp cards, portfolios, concept posts, shared by scoped, expiring, owner-revocable grants (I6) | What a public item reveals about its poster (VISION:407); whether a public link page exists (VISION:445) |
| **Media** | Stored images with metadata handling | Scanning and adult verification are real before any upload is available to anyone **[CA]** (CORY-QUESTIONS:195) |
| **Scheduling** | Availability, dates, reminders | |
| **Trust and moderation** | Structured reports, strikes, suspension; no free-text reviews **[R]** (VISION:513) | What suspension blocks (D9) |
| **Entitlements** | Capacity and convenience by plan | The initiation boundary (D7); pricing is deferred doctrine |
| **Youth partition** | Separate, gated on counsel | Everything (VISION:463) |

## 4. A thesis, not a rule

The previous version said the agreement record is the centre of the domain and every other feature is a view on it, and that a feature belongs only if it feeds a shoot or is fed by one. That is Fable's architectural thesis **[F]**. It is a useful test for coherence, and it is not Cory's rule. The ratified vision includes things that stand on their own: free documents for work with people not on the app (VISION:469), and comp cards as an acquisition wedge in their own right (VISION:420). Later areas are not required to hang from a collaboration.

## 5. What this deliberately changes from the prototype

- What is being arranged and what was agreed are kept apart (the prototype had one mutable row).
- Whoever organizes signs the obligations they undertake (the prototype's organizer signed nothing).
- Evidence records what each party was shown, not only that they responded.
- Messages have delivery state.
- There is no directory and no discovery area; people are never the subject of a query.

Removed from this list because they were mechanisms or assumptions rather than settled changes: one signing primitive shared by briefs and documents; one bearer-credential mechanism for invitations, share links and grants; audience as a shared value from the start.

## 6. First-slice footprint

Access, collaboration working state, agreement evidence and notifications, each only as far as Cory's selected scenario requires. Nothing else exists in code during the first slice.
