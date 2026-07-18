import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./component/Login";
import Register from "./component/Register";
import Student from "./component/Student"; // This is your InternDashboard
import QuizInstructions from "./component/QuizInstructions";
import QuizPage from "./component/QuizPage"; // Make sure this path is correct
import AdminDashboard from "./component/AdminDashboard";




function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/student" element={<Student />} />
      
      {/* Route 1: Instructions */}
      <Route path="/quiz/:id" element={<QuizInstructions />} />
      
      {/* Route 2: The actual quiz (Added /take) */}
      <Route path="/quiz/:id/take" element={<QuizPage />} /> 
      
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}

export default App;






