import { ClassInterface } from 'classInterface';
import { DeleteVehicle, IsPlateAvailable, IsVinAvailable, SaveVehicleData, SetVehicleColumn } from './db';
import { getRandomString, getRandomAlphanumeric, getRandomChar, getRandomInt, sleep } from '@overextended/ox_lib';
import { PLATE_PATTERN } from '../../common/config';
import type { Dict, VehicleData } from 'types';
import { GetVehicleData, GetVehicleNetworkType } from '../../common/vehicles';
import { setVehicleProperties } from '@overextended/ox_lib/server';
import { Vector3 } from '@nativewrappers/fivem';

function GetPedsInVehicle(vehicle: number) {
	let peds = []
	for (let seat = -1; seat <= 10; seat++) {
		const pedInSeat = GetPedInVehicleSeat(vehicle, seat)
		if (pedInSeat !== 0) peds.push(pedInSeat)
	}
	return peds
}

export class OxVehicle extends ClassInterface {
	entity: number;
	netId: number;
	script: string;
	plate: string;
	model: string;
	make: string;
	id?: number;
	vin?: string;
	owner?: number;
	group?: string;
	#metadata: Dict<any>;
	#stored: string | null;

	protected static members: Dict<OxVehicle> = {};
	protected static keys: Dict<Dict<OxVehicle>> = {
		id: {},
		netId: {},
		vin: {},
	};

	static spawn(model: string, coords: Vector3, heading?: number) {
		return CreateVehicleServerSetter(model, GetVehicleNetworkType(model), coords.x, coords.y, coords.z, heading || 0);
	}

	/** Get an instance of OxVehicle with the matching entityId. */
	static get(entityId: string | number) {
		return this.members[entityId];
	}

	/** Get an instance of OxVehicle with the matching vehicleId. */
	static getFromVehicleId(vehicleId: number) {
		return this.keys.id[vehicleId];
	}

	/** Get an instance of OxVehicle with the matching netId. */
	static getFromNetId(id: number) {
		return this.keys.netId[id];
	}

	/** Get an instance of OxVehicle with the matching vin. */
	static getFromVin(vin: string) {
		return this.keys.vin[vin];
	}

	/** Gets all instances of OxVehicle. */
	static getAll(): Dict<OxVehicle> {
		return this.members;
	}

	static async generateVin({ make, name }: VehicleData) {
		if (!name) throw new Error(`generateVin received invalid VehicleData (invalid model)`);

		const arr = [
			getRandomInt(),
			make ? make.slice(0, 2).toUpperCase() : 'OX',
			name.slice(0, 2).toUpperCase(),
			null,
			null,
			Math.floor(Date.now() / 1000),
		];

		while (true) {
			arr[3] = getRandomAlphanumeric();
			arr[4] = getRandomChar();
			const vin = arr.join('');

			if (await IsVinAvailable(vin)) return vin;
		}
	}

	static async generatePlate() {
		while (true) {
			const plate = getRandomString(PLATE_PATTERN);

			if (await IsPlateAvailable(plate)) return plate;
		}
	}

	static saveAll(resource?: string, despawn?: boolean) {
		if (resource === 'ox_core') resource = '';

		const parameters = [];

		for (const id in this.members) {
			const vehicle = this.members[id];

			if (!resource || resource === vehicle.script) {
				if (vehicle.owner || vehicle.group) {
					parameters.push(vehicle.#getSaveData());
				}

				if (despawn) vehicle.despawn();
			}
		}

		DEV: console.info(`Saving ${parameters.length} vehicles to the database.`);

		if (parameters.length > 0) {
			SaveVehicleData(parameters, true);
			console.log(`[^2INFO^7] Saved ^5${parameters.length}^7 vehicles to the database.`)
			emit('ox:savedVehicles', parameters.length);
		}
	}

	constructor(
		entity: number,
		script: string,
		plate: string,
		model: string,
		make: string,
		stored: string | null,
		metadata: Dict<any>,
		id?: number,
		vin?: string,
		owner?: number,
		group?: string
	) {
		super();
		this.entity = entity;
		this.netId = NetworkGetNetworkIdFromEntity(entity);
		this.script = script;
		this.plate = plate;
		this.model = model;
		this.make = make;
		this.id = id;
		this.vin = vin;
		this.owner = owner;
		this.group = group;
		this.#metadata = metadata || {};
		this.#stored = stored;

		if (this.id && !this.#stored?.startsWith("property_")) this.setStored(null, false);

		OxVehicle.add(this.entity, this);
		const state = this.getState();
		for (const key in metadata) {
			if (key !== 'properties') {
				state.set(key, metadata[key], true);
			}
		}
		state.set('vehicleId', this.id, true);
		SetEntityRoutingBucket(this.entity, metadata.instance || 0);
		setVehicleProperties(entity, metadata.properties);

		emit('ox:spawnedVehicle', this.entity, this.id);
	}

	/** Stores a value in the vehicle's metadata. */
	set(key: string, value: any) {
		this.#metadata[key] = value;
	}

	/** Gets a value stored in vehicle's metadata. */
	get(key: string) {
		return this.#metadata[key];
	}

	getState() {
		return Entity(this.entity).state;
	}

	#getSaveData() {
		if (!this.id) return;
		if (this.entity && DoesEntityExist(this.entity) && !Entity(this.entity).state["ox_lib:setVehicleProperties"]) {
			const coords = GetEntityCoords(this.entity);
			const heading = GetEntityHeading(this.entity);
			this.set('coords', [coords[0], coords[1], coords[2], heading]);
		}
		return [this.#stored, JSON.stringify(this.#metadata), this.id];
	}

	save() {
		const saveData = this.#getSaveData();
		return saveData && SaveVehicleData(saveData);
	}

	async despawn(save?: boolean) {
		const saveData = save && this.#getSaveData();
		if (saveData) SaveVehicleData(saveData);
		let occupants: number[] = [];
		if (DoesEntityExist(this.entity)) {
			occupants = GetPedsInVehicle(this.entity);
			occupants.forEach((ped) => TaskLeaveVehicle(ped, this.entity, 64));
		}
		if (occupants.length > 0) await sleep(1500);
		if (DoesEntityExist(this.entity)) DeleteEntity(this.entity);

		OxVehicle.remove(this.entity);
	}

	delete() {
		if (this.id) DeleteVehicle(this.id);
		this.despawn(false);
	}

	setStored(value: string | null, despawn?: boolean) {
		this.#stored = value;

		if (despawn) return this.despawn(true);

		SetVehicleColumn(this.id, 'stored', value);
	}

	setOwner(charId?: number) {
		if (this.owner === charId) return;

		charId ? (this.owner = charId) : delete this.owner;

		SetVehicleColumn(this.id, 'owner', this.owner);
	}

	setGroup(group?: string) {
		if (this.group === group) return;

		group ? (this.group = group) : delete this.group;

		SetVehicleColumn(this.id, 'group', this.group);
	}

	setPlate(plate: string) {
		if (this.plate === plate) return;

		this.plate = plate.padEnd(8);

		SetVehicleColumn(this.id, 'plate', this.plate);
	}

	async respawn(coords?: Vector3, rotation?: Vector3) {
		const hasEntity = DoesEntityExist(this.entity);
		coords = Vector3.fromObject(coords || hasEntity ? GetEntityCoords(this.entity) : null);
		rotation = Vector3.fromObject(rotation || hasEntity ? GetEntityRotation(this.entity) : null);

		OxVehicle.remove(this.entity);
		const oldEntity = this.entity;
		if (hasEntity) DeleteVehicle(this.entity);

		this.entity = OxVehicle.spawn(this.model, coords, 0);
		this.netId = NetworkGetNetworkIdFromEntity(this.entity);

		if (rotation) SetEntityRotation(this.entity, rotation.x, rotation.y, rotation.z, 2, false);

		OxVehicle.add(this.entity, this);
		const state = this.getState();
		for (const key in this.#metadata) {
			if (key !== 'properties') {
				state.set(key, this.#metadata[key], true);
			}
		}

		state.set('vehicleId', this.id, true);
		SetEntityRoutingBucket(this.entity, this.#metadata.instance || 0);
		setVehicleProperties(this.entity, this.#metadata.properties);
		emit('ox:respawnedVehicle', oldEntity, this.entity);
		emit('ox:spawnedVehicle', this.entity, this.id);
	}
}

OxVehicle.init();

exports('SaveAllVehicles', (arg: any) => OxVehicle.saveAll(arg));
exports('GetVehicleFromNetId', (arg: any) => OxVehicle.getFromNetId(arg));
exports('GetVehicleFromVin', (arg: any) => OxVehicle.getFromVin(arg));
exports('GenerateVehicleVin', (model: string) => OxVehicle.generateVin(GetVehicleData(model)));
exports('GenerateVehiclePlate', () => OxVehicle.generatePlate());
