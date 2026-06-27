import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../../src/components/ui/button";
import { Badge } from "../../src/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardFrame,
  CardFrameAction,
  CardFrameDescription,
  CardFrameFooter,
  CardFrameHeader,
  CardFrameTitle,
  CardHeader,
  CardPanel,
  CardTitle,
} from "../../src/components/ui/card";
import { ScrollArea } from "../../src/components/ui/scroll-area";
import { Spinner } from "../../src/components/ui/spinner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
  DialogTrigger,
} from "../../src/components/ui/dialog";

describe("Button", () => {
  it("renders a default button", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).not.toBeDisabled();
  });

  it("renders a loading button with a spinner and disabled state", () => {
    render(<Button loading variant="secondary" size="lg">Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("data-loading", "");
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("honours an explicit disabled prop and a custom render element", () => {
    render(
      <Button disabled variant="ghost">
        X
      </Button>,
    );
    expect(screen.getByRole("button")).toBeDisabled();

    render(<Button render={<a href="#link">Link</a>} />);
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).not.toHaveAttribute("type"); // render branch -> typeValue undefined
  });
});

describe("Badge", () => {
  it("renders with variants and a custom render element", () => {
    render(<Badge variant="success" size="lg">New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
    render(<Badge render={<a href="#b">B</a>} />);
    expect(screen.getByRole("link", { name: "B" })).toBeInTheDocument();
  });
});

describe("Card family", () => {
  it("renders every card slot", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
          <CardAction>Act</CardAction>
        </CardHeader>
        <CardPanel>Panel</CardPanel>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Panel")).toBeInTheDocument();

    render(
      <CardFrame>
        <CardFrameHeader>
          <CardFrameTitle>FT</CardFrameTitle>
          <CardFrameDescription>FD</CardFrameDescription>
          <CardFrameAction>FA</CardFrameAction>
        </CardFrameHeader>
        <CardFrameFooter>FF</CardFrameFooter>
      </CardFrame>,
    );
    expect(screen.getByText("FT")).toBeInTheDocument();
    expect(screen.getByText("FF")).toBeInTheDocument();
  });
});

describe("ScrollArea", () => {
  it("renders content with default and customized options", () => {
    render(<ScrollArea>plain</ScrollArea>);
    expect(screen.getByText("plain")).toBeInTheDocument();
    render(
      <ScrollArea scrollFade scrollbarGutter fill clampContentMinWidth={false}>
        fancy
      </ScrollArea>,
    );
    expect(screen.getByText("fancy")).toBeInTheDocument();
  });
});

describe("Spinner", () => {
  it("renders a status role", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Dialog family", () => {
  it("renders a full dialog with header, panel, footer, and close affordances", () => {
    render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogPanel>Panel body</DialogPanel>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Panel body")).toBeInTheDocument();
    // the built-in close button is shown by default
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("renders without the built-in close button and a bare footer", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false} bottomStickOnMobile={false}>
          <DialogFooter variant="bare">bare footer</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("bare footer")).toBeInTheDocument();
  });
});
