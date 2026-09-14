export function planExperienceUnit(input) {
    let candidates;
    if (input.experienceRef === undefined) {
        candidates = input.experiences;
    }
    else {
        const sourceMatches = (input.experienceHandles ?? []).filter((handle) => handle.experienceRef === input.experienceRef);
        if (sourceMatches.length !== 1) {
            return { unitRef: input.unitRef, status: 'unresolved', needs: [] };
        }
        const matched = sourceMatches[0];
        candidates = matched === undefined ? [] : [matched.document];
    }
    for (const experience of candidates) {
        const unit = experience.units?.find((candidate) => candidate.id === input.unitRef);
        if (!unit)
            continue;
        const needs = (unit.needRefs ?? []).map((need) => {
            const summary = need;
            const id = typeof summary.id === 'string' ? summary.id : '';
            return typeof summary.description === 'string'
                ? { id, description: summary.description }
                : { id };
        });
        const plan = {
            unitRef: input.unitRef,
            status: 'resolved',
            needs,
            unit,
        };
        if (typeof unit.title === 'string')
            plan.title = unit.title;
        if (typeof unit.kind === 'string')
            plan.kind = unit.kind;
        return plan;
    }
    return { unitRef: input.unitRef, status: 'unresolved', needs: [] };
}
