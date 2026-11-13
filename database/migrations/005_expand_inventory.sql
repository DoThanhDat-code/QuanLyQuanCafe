SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.inventory_transactions', N'user_id') IS NULL
BEGIN
    ALTER TABLE dbo.inventory_transactions
        ADD user_id VARCHAR(10) NULL
            CONSTRAINT FK_inventory_transactions_users
            REFERENCES dbo.users (user_id);
END;

IF OBJECT_ID(N'dbo.inventory_audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.inventory_audit_logs (
        log_id INT IDENTITY(1, 1) PRIMARY KEY,
        material_id VARCHAR(10) NOT NULL,
        action_type VARCHAR(30) NOT NULL,
        user_id VARCHAR(10) NOT NULL,
        old_data NVARCHAR(MAX) NULL,
        new_data NVARCHAR(MAX) NULL,
        note NVARCHAR(255) NULL,
        created_at DATETIME2(7) NOT NULL DEFAULT SYSDATETIME(),

        CONSTRAINT FK_inventory_audit_logs_materials
            FOREIGN KEY (material_id) REFERENCES dbo.materials (material_id),
        CONSTRAINT FK_inventory_audit_logs_users
            FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
    );
END;

COMMIT TRANSACTION;