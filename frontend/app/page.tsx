type Contact = {
  id: number;
  name: string;
  phone: string;
};

export default async function Home() {
  const response = await fetch("http://localhost:3333/contacts", {
    cache: "no-store",
  });

  const contacts: Contact[] = await response.json();

  return (
    <main>
      <h1>CotrimBot</h1>

      <h2>Contatos</h2>

      {contacts.map((contact) => (
        <div key={contact.id}>
          <strong>{contact.name}</strong>
          <p>{contact.phone}</p>
        </div>
      ))}
    </main>
  );
}