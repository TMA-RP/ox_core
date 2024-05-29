import { db } from 'db';
import type { DbGroups } from 'types';

export function SelectGroups() {
  return db.query<DbGroups>(`
    SELECT 
      ox_groups.*, 
      JSON_ARRAYAGG(ox_group_grades.label ORDER BY ox_group_grades.grade) AS grades
    FROM 
        ox_groups 
    JOIN 
        ox_group_grades
    ON
        ox_groups.name = ox_group_grades.group
    GROUP BY 
        ox_groups.name;
  `);
}

export async function AddCharacterGroup(charId: number, name: string, grade: number) {
  return (
    (await db.update('INSERT INTO character_groups (charId, name, grade) VALUES (?, ?, ?)', [charId, name, grade])) ===
    1
  );
}

export async function UpdateCharacterGroup(charId: number, name: string, grade: number) {
  return (
    (await db.update('UPDATE character_groups SET grade = ? WHERE charId = ? AND name = ?', [grade, charId, name])) ===
    1
  );
}

export async function RemoveCharacterGroup(charId: number, name: string) {
  return (await db.update('DELETE FROM character_groups WHERE charId = ? AND name = ?', [charId, name])) === 1;
}

export function GetCharacterGroups(charId: number) {
  return db.execute<{ name: string; grade: number }>('SELECT name, grade FROM character_groups WHERE charId = ?', [
    charId,
  ]);
}
