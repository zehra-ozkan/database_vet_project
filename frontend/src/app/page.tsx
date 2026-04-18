export default async function Home() {
  let backendData = null;
  let errorMessage = null;

  try {
    // UPDATED: Using the Docker service name 'backend' and port '5000'
    const response = await fetch('http://backend:5000/api/db-check', {
      cache: 'no-store' // Prevents caching so you see live updates
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    backendData = await response.json();
  } catch (error: any) {
    errorMessage = error.message;
  }

  return (
    <main style={{ padding: "4rem", fontFamily: "sans-serif" }}>
      <h1>Frontend to Backend Connection</h1>
      
      <div style={{ 
        padding: "2rem", 
        border: "1px solid #333", 
        borderRadius: "8px",
        marginTop: "2rem" 
      }}>
        <h2>Backend Status:</h2>
        
        {errorMessage ? (
          <p style={{ color: "red" }}>Failed to connect: {errorMessage}<br/><br/>
          <em>Did you use the correct service name from your docker-compose.yml?</em></p>
        ) : (
          <pre style={{ color: "lightgreen" }}>
            {JSON.stringify(backendData, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}