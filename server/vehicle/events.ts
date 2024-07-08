import { OxVehicle } from './class';

on('onResourceStop', (resource: string) => OxVehicle.saveAll(resource, true));

on('entityRemoved', (entityId: number) => {
	const vehicle = OxVehicle.get(entityId);

	if (!vehicle) return;
	console.log(`[ceeb_debug][OX] Vehicle with plate ${vehicle.plate} has received entityRemoved event.`);
	const vehicleId = vehicle.id;
	if (!vehicleId) {
		console.log(`[ceeb_debug][OX] Vehicle with plate ${vehicle.plate} has no vehicleId.`);
		console.log(`#############################################`);
		return
	}
	const coords = vehicle.get("coords");
	vehicle.setStored(null, true);
	exports.ox_core.SpawnVehicle(vehicleId, { x: coords[0], y: coords[1], z: coords[2] }, coords[3]);
	console.log(`[ceeb_debug][OX] Vehicle with plate ${vehicle.plate} has been respawned.`);
	console.log(`#############################################`);
});
