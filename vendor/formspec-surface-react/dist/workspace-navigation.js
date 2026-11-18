export function activeWorkspaceSlot(plan, requestedSlot) {
    if (requestedSlot !== undefined)
        return requestedSlot;
    const formSlots = plan?.slots.filter(slot => slot.slotType === 'definition-form');
    return formSlots?.length === 1 ? formSlots[0]?.slotId : undefined;
}
