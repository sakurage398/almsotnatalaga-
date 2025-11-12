<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once 'db_connection.php';

function logAuditTrail($conn, $userId, $username, $action, $description, $tableName = null, $recordId = null, $oldValues = null, $newValues = null) {
    if ($userId == 0) {
        return true;
    }
    
    $ipAddress = getClientIP();
    
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    
    $oldValuesJson = $oldValues ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null;
    $newValuesJson = $newValues ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null;
    
    $username = $conn->real_escape_string($username);
    $action = $conn->real_escape_string($action);
    $description = $conn->real_escape_string($description);
    $tableName = $tableName ? $conn->real_escape_string($tableName) : null;
    $ipAddress = $conn->real_escape_string($ipAddress);
    $userAgent = $conn->real_escape_string($userAgent);
    
    $query = "INSERT INTO audit_trail (user_id, username, action, description, table_name, record_id, old_values, new_values, ip_address, user_agent) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($query);
    if (!$stmt) {
        error_log("Prepare failed: " . $conn->error);
        return false;
    }
    
    $stmt->bind_param("issssissss", $userId, $username, $action, $description, $tableName, $recordId, $oldValuesJson, $newValuesJson, $ipAddress, $userAgent);
    
    if ($stmt->execute()) {
        return true;
    } else {
        error_log("Audit trail error: " . $stmt->error);
        return false;
    }
}

function getClientIP() {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        return $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return $_SERVER['HTTP_X_FORWARDED_FOR'];
    } else {
        return $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
    }
}

function getCurrentUserInfo() {
    if (session_status() == PHP_SESSION_NONE) {
        session_start();
    }
    
    if (isset($_SESSION['user_id']) && $_SESSION['user_id'] == 0) {
        return [
            'id' => 0,
            'username' => 'lala.montemayor',
            'name' => 'Lala E. Montemayor',
            'role' => 'Chief Librarian'
        ];
    }
    
    return [
        'id' => $_SESSION['user_id'] ?? null,
        'username' => $_SESSION['username'] ?? 'System',
        'name' => $_SESSION['name'] ?? 'System',
        'role' => $_SESSION['user_type'] ?? 'Unknown'
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'log_audit_trail') {
    $userInfo = getCurrentUserInfo();
    
    if ($userInfo['id'] !== null) {
        $auditAction = $_POST['audit_action'] ?? 'UNKNOWN_ACTION';
        $description = $_POST['description'] ?? 'No description provided';
        
        $success = logAuditTrail(
            $conn,
            $userInfo['id'],
            $userInfo['username'],
            $auditAction,
            $description,
            null,
            null,
            null,
            null
        );
        
        if ($success) {
            echo json_encode(['status' => 'success', 'message' => 'Audit trail logged successfully']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to log audit trail']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'User not logged in']);
    }
    exit;
}
?>