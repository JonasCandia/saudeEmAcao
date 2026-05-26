export interface ScopeContext {
  legacyAccess: boolean;
  areaIds: string[];
  ruaIdsExtras: string[];
}

export function canAccessByArea(areaId: string | null | undefined, scope: ScopeContext): boolean {
  if (scope.legacyAccess) return true;
  if (!areaId) return false;
  return scope.areaIds.includes(areaId);
}

export function canAccessByRua(ruaId: string | null | undefined, scope: ScopeContext): boolean {
  if (scope.legacyAccess) return true;
  if (!ruaId) return false;
  return scope.ruaIdsExtras.includes(ruaId);
}

export function canAccessTerritory(params: {
  areaId?: string | null;
  ruaId?: string | null;
  scope: ScopeContext;
}): boolean {
  const { areaId, ruaId, scope } = params;
  if (scope.legacyAccess) return true;
  return canAccessByArea(areaId, scope) || canAccessByRua(ruaId, scope);
}
