USE [QuanLyQuanCafe];
GO

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    ALTER TABLE dbo.users
        DROP CONSTRAINT CK_users_role;

    ALTER TABLE dbo.users WITH CHECK
        ADD CONSTRAINT CK_users_role CHECK (
            [role] IN (
                'admin',
                'manager',
                'phucvu',
                'thungan',
                'kho',
                'waiter',
                'cashier',
                'inventory',
                'product_manager',
                'hr_manager'
            )
        );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;

SELECT name, definition
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'dbo.users')
  AND name = N'CK_users_role';