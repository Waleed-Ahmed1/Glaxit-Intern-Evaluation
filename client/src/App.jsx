import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./component/Login";
import Register from "./component/Register";
import Student from "./component/Student"; // This is your InternDashboard
import QuizInstructions from "./component/Quizinstructions";
import QuizPage from "./component/QuizPage"; // Make sure this path is correct
import AdminDashboard from "./component/AdminDashboard";
import ProtectedRoute from "./component/ProtectedRoute";




function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Student />
          </ProtectedRoute>
        }
      />

      {/* Route 1: Instructions */}
      <Route
        path="/quiz/:id"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <QuizInstructions />
          </ProtectedRoute>
        }
      />

      {/* Route 2: The actual quiz (Added /take) */}
      <Route
        path="/quiz/:id/take"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <QuizPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Anything else — unknown URL, typo, etc. — back to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;