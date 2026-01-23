"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
}

interface ClientSelectorProps {
  value: string;
  onValueChange: (clientId: string, client?: Client) => void;
  error?: boolean;
  disabled?: boolean;
}

export function ClientSelector({
  value,
  onValueChange,
  error,
  disabled,
}: ClientSelectorProps) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
  });

  const supabase = createClient();
  const selectedClient = clients.find((c) => c.id === value);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) return;

    setCreatingClient(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: newClient.name.trim(),
          email: newClient.email.trim() || null,
          phone: newClient.phone.trim() || null,
          address: newClient.address.trim() || null,
          city: newClient.city.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local list
      setClients((prev) => [...prev, data]);

      // Select the new client
      onValueChange(data.id, data);

      // Reset and close
      setNewClient({ name: "", email: "", phone: "", address: "", city: "" });
      setShowNewClientDialog(false);
      setOpen(false);
    } catch (error) {
      console.error("Error creating client:", error);
    } finally {
      setCreatingClient(false);
    }
  };

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              error && "border-destructive",
              !value && "text-muted-foreground"
            )}
          >
            {selectedClient ? selectedClient.name : "Select client..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search clients..."
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    <div className="text-center py-6">
                      <p className="text-sm text-muted-foreground mb-3">
                        No client found
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewClient({ ...newClient, name: searchTerm });
                          setShowNewClientDialog(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create "{searchTerm}"
                      </Button>
                    </div>
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredClients.map((client) => {
                      const handleSelect = () => {
                        onValueChange(client.id, client);
                        setOpen(false);
                        setSearchTerm("");
                      };

                      return (
                      <CommandItem
                        key={client.id}
                        value={client.id}
                        onSelect={handleSelect}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelect();
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === client.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{client.name}</div>
                          {(client.email || client.phone) && (
                            <div className="text-xs text-muted-foreground">
                              {client.email && <span>{client.email}</span>}
                              {client.email && client.phone && <span> • </span>}
                              {client.phone && <span>{client.phone}</span>}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    )}
                    )}
                  </CommandGroup>
                  {!loading && filteredClients.length > 0 && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => setShowNewClientDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Client
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* New Client Dialog */}
      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
            <DialogDescription>
              Add a new client to your database. This client will be available for all projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">
                Client Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="client-name"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                placeholder="e.g., Atlantis Resorts"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={newClient.phone}
                onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                placeholder="(242) 555-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-address">Address</Label>
              <Input
                id="client-address"
                value={newClient.address}
                onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                placeholder="123 Bay Street"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-city">City</Label>
              <Input
                id="client-city"
                value={newClient.city}
                onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                placeholder="Nassau"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewClientDialog(false);
                setNewClient({ name: "", email: "", phone: "", address: "", city: "" });
              }}
              disabled={creatingClient}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={!newClient.name.trim() || creatingClient}
            >
              {creatingClient && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
