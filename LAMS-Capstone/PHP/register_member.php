<?php
require_once 'db_connection.php';

header('Content-Type: application/json');

$idNumber = isset($_POST['idNumber']) ? $_POST['idNumber'] : '';
$userType = isset($_POST['userType']) ? $_POST['userType'] : '';
$qrCode = isset($_POST['qrCode']) ? $_POST['qrCode'] : '';
$expirationDate = isset($_POST['expirationDate']) ? $_POST['expirationDate'] : '';

if (empty($idNumber) || empty($userType) || empty($qrCode)) {
    echo json_encode([
        'success' => false,
        'message' => 'Missing required parameters'
    ]);
    exit;
}

if ($qrCode !== $idNumber) {
    echo json_encode([
        'success' => false,
        'message' => 'QR code does not match the ID number'
    ]);
    exit;
}

if (empty($expirationDate)) {
    $currentMonth = date('n');
    $currentYear = date('Y');
    
    if ($currentMonth >= 7 && $currentMonth <= 12) {
        $expirationDate = date('Y-12-30');
    } else {
        $expirationDate = date('Y-06-30');
    }
}

try {
    if ($userType === 'student') {
        $stmt = $conn->prepare("SELECT registration_status FROM students WHERE student_number = ?");
        $stmt->bind_param("s", $idNumber);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            echo json_encode([
                'success' => false,
                'message' => 'Student not found'
            ]);
            exit;
        }
        
        $student = $result->fetch_assoc();
        if ($student['registration_status'] === 'Registered') {
            echo json_encode([
                'success' => false,
                'message' => 'Student already registered'
            ]);
            exit;
        }
        
        $stmt = $conn->prepare("UPDATE students SET registration_status = 'Registered', expiration_date = ? WHERE student_number = ?");
        $stmt->bind_param("ss", $expirationDate, $idNumber);
        $success = $stmt->execute();
        
        if ($success) {
            echo json_encode([
                'success' => true,
                'message' => 'Student registration successful',
                'expirationDate' => $expirationDate
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Failed to update registration status'
            ]);
        }
        
    } elseif ($userType === 'faculty') {
        $stmt = $conn->prepare("SELECT registration_status FROM faculty WHERE faculty_number = ?");
        $stmt->bind_param("s", $idNumber);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            echo json_encode([
                'success' => false,
                'message' => 'Faculty member not found'
            ]);
            exit;
        }
        
        $faculty = $result->fetch_assoc();
        if ($faculty['registration_status'] === 'Registered') {
            echo json_encode([
                'success' => false,
                'message' => 'Faculty member already registered'
            ]);
            exit;
        }
        
        $stmt = $conn->prepare("UPDATE faculty SET registration_status = 'Registered', expiration_date = ? WHERE faculty_number = ?");
        $stmt->bind_param("ss", $expirationDate, $idNumber);
        $success = $stmt->execute();
        
        if ($success) {
            echo json_encode([
                'success' => true,
                'message' => 'Faculty registration successful',
                'expirationDate' => $expirationDate
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Failed to update registration status'
            ]);
        }
        
    } elseif ($userType === 'staff') {
        $stmt = $conn->prepare("SELECT registration_status FROM staff WHERE staff_number = ?");
        $stmt->bind_param("s", $idNumber);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            echo json_encode([
                'success' => false,
                'message' => 'Staff member not found'
            ]);
            exit;
        }
        
        $staff = $result->fetch_assoc();
        if ($staff['registration_status'] === 'Registered') {
            echo json_encode([
                'success' => false,
                'message' => 'Staff member already registered'
            ]);
            exit;
        }
        
        $stmt = $conn->prepare("UPDATE staff SET registration_status = 'Registered', expiration_date = ? WHERE staff_number = ?");
        $stmt->bind_param("ss", $expirationDate, $idNumber);
        $success = $stmt->execute();
        
        if ($success) {
            echo json_encode([
                'success' => true,
                'message' => 'Staff registration successful',
                'expirationDate' => $expirationDate
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Failed to update registration status'
            ]);
        }
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid user type'
        ]);
    }
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}

if (isset($stmt)) {
    $stmt->close();
}
$conn->close();
?>