
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.inventory_audit_logs', N'U') IS NULL
    THROW 51000, N'Chạy 005_expand_inventory.sql trước.', 1;

IF OBJECT_ID(N'dbo.FK_inventory_audit_logs_materials', N'F') IS NOT NULL
    ALTER TABLE dbo.inventory_audit_logs
        DROP CONSTRAINT FK_inventory_audit_logs_materials;

COMMIT TRANSACTION;