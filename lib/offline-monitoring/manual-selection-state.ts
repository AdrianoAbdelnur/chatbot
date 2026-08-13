export type ManualSelectionState = {
  selectedCompanyKeys: string[];
  selectedVehicleIds: string[];
};

export function createManualSelectionState(): ManualSelectionState {
  return { selectedCompanyKeys: [], selectedVehicleIds: [] };
}

export function toggleManualCompany(state: ManualSelectionState, companyKey: string): ManualSelectionState {
  const selectedCompanyKeys = state.selectedCompanyKeys.includes(companyKey)
    ? state.selectedCompanyKeys.filter((key) => key !== companyKey)
    : [...state.selectedCompanyKeys, companyKey];
  return { ...state, selectedCompanyKeys };
}

export function toggleManualVehicle(state: ManualSelectionState, vehicleId: string): ManualSelectionState {
  const selectedVehicleIds = state.selectedVehicleIds.includes(vehicleId)
    ? state.selectedVehicleIds.filter((id) => id !== vehicleId)
    : [...state.selectedVehicleIds, vehicleId];
  return { ...state, selectedVehicleIds };
}

export function clearManualSelection(state: ManualSelectionState): ManualSelectionState {
  return { ...state, selectedCompanyKeys: [], selectedVehicleIds: [] };
}
