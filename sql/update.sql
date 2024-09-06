-- Update characters table
ALTER TABLE `characters`
ADD COLUMN `fullName` VARCHAR(101) AS (CONCAT(`firstName`, ' ', `lastName`)) STORED;

ALTER TABLE `characters`
MODIFY `statuses` LONGTEXT COLLATE utf8mb4_bin NOT NULL DEFAULT JSON_OBJECT(),
ADD CHECK (JSON_VALID(`statuses`));

-- Add full-text index to characters.fullName
CREATE FULLTEXT INDEX IF NOT EXISTS `characters_fullName_index`
ON `characters` (`fullName`);

-- Add full-text index to accounts.label
CREATE FULLTEXT INDEX IF NOT EXISTS `accounts_label_index`
ON `accounts` (`label`);

-- Update account_roles table structure
ALTER TABLE `account_roles`
ADD COLUMN `sendInvoice` TINYINT(1) NOT NULL DEFAULT '0',
ADD COLUMN `payInvoice` TINYINT(1) NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS `accounts_invoices`
(
    `id`          INT UNSIGNED AUTO_INCREMENT
        PRIMARY KEY,
    `actorId`     INT UNSIGNED                          NULL,
    `payerId`     INT UNSIGNED                          NULL,
    `fromAccount` INT UNSIGNED                          NOT NULL,
    `toAccount`   INT UNSIGNED                          NOT NULL,
    `amount`      INT UNSIGNED                          NOT NULL,
    `message`     VARCHAR(255)                          NULL,
    `sentAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP() NOT NULL,
    `dueDate`     TIMESTAMP                             NOT NULL,
    `paidAt`      TIMESTAMP                             NULL,
    CONSTRAINT `accounts_invoices_accounts_id_fk`
        FOREIGN KEY (`fromAccount`) REFERENCES `accounts` (`id`),
    CONSTRAINT `accounts_invoices_accounts_id_fk_2`
        FOREIGN KEY (`toAccount`) REFERENCES `accounts` (`id`),
    CONSTRAINT `accounts_invoices_characters_charId_fk`
        FOREIGN KEY (`payerId`) REFERENCES `characters` (`charId`),
    CONSTRAINT `accounts_invoices_characters_charId_fk_2`
        FOREIGN KEY (`actorId`) REFERENCES `characters` (`charId`)
);

CREATE FULLTEXT INDEX IF NOT EXISTS `idx_message_fulltext`
    ON `accounts_invoices` (`message`);