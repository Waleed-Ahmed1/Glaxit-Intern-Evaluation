import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Performance = () => {
  const history = [
    { title: "Python Basics", date: "July 05", score: 85, time: 15 },
    { title: "AI Fundamentals", date: "July 07", score: 90, time: 20 },
  ];

  return (
    <div className="performance-container">
      {/* Quiz History Table */}
      <section className="data-table">
        <h2>Quiz History</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Date</th>
              <th>Score</th>
              <th>Time Taken (min)</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, index) => (
              <tr key={index}>
                <td>{h.title}</td>
                <td>{h.date}</td>
                <td>{h.score}%</td>
                <td>{h.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Analytics Charts */}
      <section className="charts-container" style={{ marginTop: '20px' }}>
        <div className="chart-card">
          <h3>Score Trend (%)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="title" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#6c5ce7" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Time Efficiency (min)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={history}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="title" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="time" fill="#00b894" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default Performance;