export function planExperienceUnit(input) {
    const candidates = input.experienceRef
        ? input.experiences.filter((experience) => experience.url === input.experienceRef ||
            experience.id === input.experienceRef)
        : input.experiences;
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
