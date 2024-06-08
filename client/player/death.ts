import { cache, requestAnimDict, sleep, notify, triggerServerCallback } from '@overextended/ox_lib/client';
import { Vector4 } from '@nativewrappers/fivem';
import { OxPlayer } from 'player';
import { formatDistanceStrict } from "date-fns";
import { fr } from "date-fns/locale";

function helpNotify(message: string){
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
    const hospital = Vector4.fromArray([315.1152, -568.4263, 48.2142, 257.3210]);

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
}

function IsPlayingAllowedAnim() {
    for (let index = 0; index < allowedAnimationsWhileDead.length; index++) {
        const anim = allowedAnimationsWhileDead[index];
        if (IsEntityPlayingAnim(cache.ped, anim[0], anim[1], 3)) return true;
    }
    return false;
}

async function OnPlayerDeath() {
  OxPlayer.state.set("isDead", true, true);
  const newTimestamp = Date.now() + 10 * 60 * 1000; // 10 minutes
  const oldTimestamp = OxPlayer.state.deathTimestamp;
  const timestamp = oldTimestamp ? oldTimestamp : newTimestamp;
  if (!oldTimestamp) OxPlayer.state.set("deathTimestamp", newTimestamp, true); 
  
  playerIsDead = true;

  exports['pma-voice'].overrideProximityCheck(() => {
    return false
  });
  exports["lb-phone"].ToggleOpen(false, true);
  exports["lb-phone"].ToggleDisabled(true);
  exports["scully_emotemenu"].setLimitation(true);
  OxPlayer.state.set("invBusy", true, false);
  
  emit('ox_inventory:disarm');
  AnimpostfxPlay('DeathFailOut', 0, true);
  let hasSentDistress = false;

  const tickId = setTick(async() => {
    const anim = cache.vehicle ? anims[1] : anims[0];
    const currentDate = Date.now();

    if (!IsEntityPlayingAnim(cache.ped, anim[0], anim[1], 3) && !IsPlayingAllowedAnim()){
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
            const canBeRevived = await triggerServerCallback("ceeb_job:canRevive", cache.serverId);
            if (canBeRevived) {
                const ambulancePlayers = await triggerServerCallback<number>("ceeb_duty:getWorkingByJob", 0, "ambulance");
                if (ambulancePlayers! <= 100) { // @TODOCEEB change this to a real value after ambulance job players are ready to work
                    ClearDeath(tickId, true);
                } else {
                    notify({ type: "error", description: "L'unité X est indisponible pour le moment" });
                }
            }
        }
    }


    if (!OxPlayer.state.isDead) ClearDeath(tickId, false);
  });

  const coords = GetEntityCoords(cache.ped, true);
  const health = GetEntityMaxHealth(cache.ped) - 65;

  while (IsPedRagdoll(cache.ped)) await sleep(0);

  NetworkResurrectLocalPlayer(coords[0], coords[1], coords[2], GetEntityHeading(cache.ped), 0, false);

  if (cache.vehicle) SetPedIntoVehicle(cache.ped, cache.vehicle, cache.seat);

  SetEntityInvincible(cache.ped, true);
  SetEntityHealth(cache.ped, health);
  SetEveryoneIgnorePlayer(cache.playerId, true);
}

on('ox:playerLoaded', () => {
  const id: CitizenTimer = setInterval(() => {
    if (!OxPlayer.isLoaded) return clearInterval(id);

    if (!playerIsDead && IsPedDeadOrDying(PlayerPedId(), true)) OnPlayerDeath();
  }, 200);
});
