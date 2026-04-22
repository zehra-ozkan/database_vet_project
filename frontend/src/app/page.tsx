export default async function Home() {
  let backendData: any = null;
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
    <main className="min-h-screen bg-gray-50 p-8 md:p-12 lg:p-16 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
            Database Viewer
          </h1>
          <p className="text-lg text-gray-500">
            Live overview of all tables in the database.
          </p>
        </header>

        {errorMessage ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-red-700 mb-2">Connection Failed</h2>
            <p className="text-red-600 mb-4">{errorMessage}</p>
            <p className="text-sm text-red-500 italic">
              Did you use the correct service name from your docker-compose.yml?
            </p>
          </div>
        ) : backendData?.data ? (
          <div className="space-y-10">
            {Object.entries(backendData.data).map(([tableName, rows]: [string, any]) => {
              const tableRows = rows as any[];
              const columns = tableRows.length > 0 ? Object.keys(tableRows[0]) : [];

              return (
                <div key={tableName} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800 capitalize tracking-tight">
                      {tableName.replace(/_/g, ' ')}
                    </h2>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {tableRows.length} record{tableRows.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    {tableRows.length > 0 ? (
                      <table className="w-full text-left whitespace-nowrap">
                        <thead>
                          <tr className="bg-gray-50/50">
                            {columns.map((col) => (
                              <th key={col} className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {tableRows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                              {columns.map((col) => (
                                <td key={col} className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
                                  {row[col] !== null ? String(row[col]) : <span className="text-gray-400 italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="px-6 py-12 text-center">
                        <p className="text-gray-500">This table is empty.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-32"></div>
            </div>
            <p className="mt-6 text-gray-500 font-medium">Loading database contents...</p>
          </div>
        )}
      </div>
    </main>
  );
}