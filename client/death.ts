import { cache, requestAnimDict, sleep, notify, triggerServerCallback } from '@overextended/ox_lib/client';
import { Vector4 } from '@nativewrappers/fivem';
import { OxPlayer } from 'player';
import { formatDistanceStrict } from "date-fns";
import { fr } from "date-fns/locale";

function helpNotify(message: string) {
	AddTextEntry("HelpMsg", message)
	BeginTextCommandDisplayHelp("HelpMsg")
	EndTextCommandDisplayHelp(0, false, false, -1)
}

const anims = [
	['missfinale_c1@', 'lying_dead_player0'],
	['veh@low@front_ps@idle_duck', 'sit'],
];

const allowedAnimationsWhileDead = [
	['nm', 'firemans_carry'],
	['amb@code_human_in_car_idles@generic@ps@base', 'base'],
];

let playerIsDead = false;

/**
 * @todo Configs to disable builtin bleedout/respawns.
 * We still want to handle the generic death loop to prevent
 * random variables in weird death systems.
 */

async function ClearDeath(tickId: number, bleedOut: boolean) {
	OxPlayer.state.set("isDead", false, true);
	exports['pma-voice'].resetProximityCheck();
	exports["lb-phone"].ToggleDisabled(false);
	exports["scully_emotemenu"].setLimitation(false);
	const anim = cache.vehicle ? anims[1] : anims[0];
	OxPlayer.state.set("deathTimestamp", false, true)
	OxPlayer.state.set("invBusy", false, false);
	playerIsDead = false;
	clearTick(tickId);

	if (bleedOut) {
		const hospital = Vector4.fromArray([323.5289, -584.9305, 43.2841, 64.2267]);

		DoScreenFadeOut(800);
		RequestCollisionAtCoord(hospital.x, hospital.y, hospital.z);

		while (!IsScreenFadedOut()) await sleep(10);
		await sleep(1000);

		AnimpostfxStop('DeathFailOut');
		StopAnimTask(cache.ped, anim[0], anim[1], 8.0);
		SetEntityCoordsNoOffset(cache.ped, hospital.x, hospital.y, hospital.z, false, false, false);
		SetEntityHeading(cache.ped, hospital.w);
		SetGameplayCamRelativeHeading(0);
		emit("ceeb_job:setUnityXNerf");


		DoScreenFadeIn(800);

		while (!IsScreenFadedIn()) await sleep(10);
	} else {
		AnimpostfxStop('DeathFailOut');
		StopAnimTask(cache.ped, anim[0], anim[1], 8.0);
	}
	ClearPedBloodDamage(cache.ped);
	SetPlayerControl(cache.playerId, false, 0);
	SetEveryoneIgnorePlayer(cache.playerId, false);
	SetPlayerControl(cache.playerId, true, 0);
	SetPlayerInvincible(cache.playerId, false);

	for (let index = 0; index < anims.length; index++) RemoveAnimDict(anims[index][0]);

	emit('ox:playerRevived');
}

function IsPlayingAllowedAnim() {
	for (let index = 0; index < allowedAnimationsWhileDead.length; index++) {
		const anim = allowedAnimationsWhileDead[index];
		if (IsEntityPlayingAnim(cache.ped, anim[0], anim[1], 3)) return true;
	}
	return false;
}

let waitingForDeath = false;

async function OnPlayerDeath() {
	if (waitingForDeath) return;
	waitingForDeath = true;
	if (!OxPlayer.state.isDead) {
		emitNet("ceeb_job:newDeath");
	}
	const newTimestamp = Date.now() + 15 * 60 * 1000; // 15 minutes
	const waitUntil = Date.now() + 1000;
	while (!OxPlayer.state.deathTimestamp && Date.now() < waitUntil) {
		await sleep(100);
	}
	const oldTimestamp = OxPlayer.state.deathTimestamp;
	const timestamp = oldTimestamp ? oldTimestamp : newTimestamp;
	if (!oldTimestamp) OxPlayer.state.set("deathTimestamp", newTimestamp, true);

	OxPlayer.state.set("isDead", true, true);
	playerIsDead = true;
	waitingForDeath = false;

	exports['pma-voice'].overrideProximityCheck(() => {
		return false
	});
	exports["lb-phone"].ToggleOpen(false, true);
	exports["lb-phone"].ToggleDisabled(true);
	exports["scully_emotemenu"].setLimitation(true);
	OxPlayer.state.set("invBusy", true, false);

	emit('ox_inventory:disarm');
	emit('ox:playerDeath');
	AnimpostfxPlay('DeathFailOut', 0, true);
	let hasSentDistress = false;

	const tickId = setTick(async () => {
		const anim = cache.vehicle ? anims[1] : anims[0];
		const currentDate = Date.now();

		if (!IsEntityPlayingAnim(cache.ped, anim[0], anim[1], 3) && !IsPlayingAllowedAnim()) {
			await requestAnimDict(anim[0]);
			TaskPlayAnim(cache.ped, anim[0], anim[1], 50.0, 8.0, -1, 1, 1.0, false, false, false);
			RemoveAnimDict(anim[0])
		}

		DisableFirstPersonCamThisFrame();

		const time = Math.floor((timestamp - currentDate) / 1000);
		if (time > 0) {
			const formattedTime = formatDistanceStrict(timestamp, currentDate, { locale: fr });
			if (hasSentDistress) {
				helpNotify(`${formattedTime} avant de pouvoir appeler l'unité X`);
			} else {
				helpNotify(`${formattedTime} avant de pouvoir appeler l'unité X\n\n~INPUT_PICKUP~ pour envoyer un signal de détresse`);
				if (IsControlJustReleased(0, 38)) {
					hasSentDistress = true;
					TriggerServerEvent("ceeb_job:sendDistress");
				}
			}
		} else {
			helpNotify("~INPUT_PICKUP~ pour être réanimé par l'unité X");
			if (IsControlJustReleased(0, 38)) {
				const canBeRevived = await triggerServerCallback("ceeb_job:canRevive", 0, cache.serverId);
				if (canBeRevived) {
					const ambulancePlayers = await triggerServerCallback<number>("ceeb_duty:getWorkingByJob", 0, "ambulance");
					if (ambulancePlayers! < 2) {
						ClearDeath(tickId, true);
					} else {
						notify({ type: "error", description: "L'unité X est indisponible pour le moment" });
					}
				} else {
					notify({ type: "error", description: "Vous ne pouvez pas être réanimé" });
				}
			}
		}


		if (!OxPlayer.state.isDead) ClearDeath(tickId, false);
	});

	const health = 200 - 65;

	while (IsPedRagdoll(cache.ped)) await sleep(0);
	const coords = GetEntityCoords(cache.ped, true);

	NetworkResurrectLocalPlayer(coords[0], coords[1], coords[2], GetEntityHeading(cache.ped), 0, false);

	if (cache.vehicle) SetPedIntoVehicle(cache.ped, cache.vehicle, cache.seat as number);

	SetEntityInvincible(cache.ped, true);
	SetEntityHealth(cache.ped, health);
	SetEveryoneIgnorePlayer(cache.playerId, true);
}

AddStateBagChangeHandler(
	'isDead',
	`player:${cache.serverId}`,
	async (bagName: string, key: string, value: any, reserved: number, replicated: boolean) => {
		if (!replicated) return;

		playerIsDead = value;
	}
);

on('ox:playerLogout', () => {
	playerIsDead = false;
});

on('ox:playerLoaded', () => {
	const id: CitizenTimer = setInterval(() => {
		if (!OxPlayer.isLoaded) return clearInterval(id);

		if (!playerIsDead && IsPedDeadOrDying(PlayerPedId(), true)) OnPlayerDeath();
	}, 200);
});