import { useUser } from "../context/UserContext";

const TEST_USERS = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
  { id: "3", name: "Charlie" },
];

const UserSelection = () => {
  const { setCurrentUser } = useUser();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Select Your Username
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Choose a username to start chatting
          </p>
        </div>
        <div className="mt-8 space-y-4">
          {TEST_USERS.map((user) => (
            <button
              key={user.id}
              onClick={() => setCurrentUser(user)}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {user.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserSelection;
