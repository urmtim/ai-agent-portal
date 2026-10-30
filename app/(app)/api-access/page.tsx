import { redirect } from "next/navigation";

/** The «API» placeholder became «Коннекторы»: old links land there. */
export default function ApiPage() {
  redirect("/connectors");
}
