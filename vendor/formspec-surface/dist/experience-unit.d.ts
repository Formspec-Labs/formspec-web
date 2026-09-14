/**
 * @filedesc `experience-unit` — resolving the "why this screen exists" artifact.
 *
 * The Experience document says what a unit is for and whose need it serves. It
 * is arguably the most product-meaningful artifact in a bundle and had no
 * rendering anywhere in the stack (gap ledger `experience-unit-rendering`).
 *
 * The resolution is here; the presentation is the renderer binding's. What this
 * module decides is the part that is not a styling choice: **the needs a unit
 * declares are not respondent-facing copy.** `needRefs[].description` reads as an
 * internal product note — "This is the long form. It is where a dropped
 * connection costs the most." — written about the respondent, not to them. The
 * spike printed them on the intake page. A default that shows them to the person
 * filling in the form is a default that leaks the design conversation onto a
 * government service page.
 *
 * So {@link planExperienceUnit} returns the unit's title and its needs in
 * separate fields, marked by audience. A respondent renderer shows the title; an
 * authoring or review surface shows both. Neither has to guess.
 */
import type { ExperienceDocument } from '@formspec-org/types';
export type ExperienceUnit = NonNullable<ExperienceDocument['units']>[number];
/**
 * One loaded Experience paired with the exact App Manifest URL that named it.
 *
 * Source identity stays beside the document. It is not injected into the
 * Experience payload, whose schema has no document-level `url` or `id`.
 */
export interface ExperienceDocumentHandle {
    experienceRef: string;
    document: ExperienceDocument;
}
export interface ExperienceNeedSummary {
    id: string;
    description?: string;
}
export interface ExperienceUnitPlan {
    unitRef: string;
    status: 'resolved' | 'unresolved';
    /** Respondent-facing. The one string a unit reliably carries for a person. */
    title?: string;
    kind?: string;
    /**
     * NOT respondent-facing. Design rationale about the person, not for them.
     * Shown on authoring and review surfaces; withheld from respondent chrome.
     */
    needs: readonly ExperienceNeedSummary[];
    unit?: ExperienceUnit;
}
export interface ExperienceUnitPlanInput {
    unitRef: string;
    /** `binding.experienceRef` — disambiguates when a bundle carries several. */
    experienceRef?: string | undefined;
    experiences: readonly ExperienceDocument[];
    /** Exact manifested source identity for qualified `experienceRef` matching. */
    experienceHandles?: readonly ExperienceDocumentHandle[] | undefined;
}
export declare function planExperienceUnit(input: ExperienceUnitPlanInput): ExperienceUnitPlan;
